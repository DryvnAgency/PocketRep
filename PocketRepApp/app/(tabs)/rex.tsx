import { useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, ScrollView, Share,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Contact, RexMessage, RexMemory, Profile } from '@/lib/types';
import { INDUSTRY_CONFIG } from '@/lib/industryConfig';
import { callBrain } from '@/lib/v2/aiProxy';
import { buildCoachMessages } from '@/lib/v2/coachBrain';
import { startDictation, isDictationAvailable, type Dictation } from '@/lib/v2/sttDictation';
import { launchSms } from '@/lib/v2/smsLauncher';

// Legacy/native V1 compatibility signature. The server intercepts this exact
// slug and routes supported Rex work through the current DeepSeek stack.
const REX_MODEL = 'gemini-2.5-flash';
const AI_PROXY_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL ?? 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

// Lazy-load expo-image-picker so a missing package never crashes the app
let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// ── Action types Rex can execute ─────────────────────────────────────────────
// 'log_customer' and 'start_sequence' were declared here and (log_customer
// only) offered to the model in the prompt below, but executeAction() never
// had a case for either — the rep would see a "confirm" card that silently
// did nothing on tap. Removed rather than implemented: this V1 surface is
// intentionally self-contained (mass_text / show_followups only); logging a
// customer or starting a sequence from chat is real new functionality, not a
// one-line fix, and already exists on the V2 side (lib/v2/rexActions.ts).
interface RexAction {
  type: 'mass_text' | 'show_followups';
  filter?: { vehicle_make?: string; stage?: string; lease_months?: number };
  message?: string;
  contact_name?: string;
  sequence_name?: string;
}

function parseRexAction(text: string): RexAction | null {
  const match = text.match(/<action>([\s\S]*?)<\/action>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripActionTag(text: string): string {
  return text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();
}

// An explicit "do something in the app" request (mass text, follow-up list, log
// a customer, start a sequence) stays on the legacy action path below. Everything
// else is a coaching question and routes to the real coaching engine.
function isActionIntent(text: string): boolean {
  const q = text.toLowerCase();
  return (
    /\b(mass text|blast|text (?:all|everyone|my)|send (?:a )?text to)\b/.test(q) ||
    /\b(who should i (?:call|contact|hit)|follow[- ]?up list|who needs|who'?s due|pull (?:my )?follow)\b/.test(q) ||
    /\blog (?:this|a|the|him|her|them)\b/.test(q) ||
    /\b(start (?:a )?sequence|enroll|drip)\b/.test(q)
  );
}

// CRM context for the coaching engine, built from this surface's v1 Contact
// shape (lib/v2/repContext.ts serializes the v2 shape; same idea, v1 fields).
function buildRexRepContext(contacts: Contact[], active: Contact | null): string {
  if (active) {
    const vehicle = [active.vehicle_year, active.vehicle_make, active.vehicle_model].filter(Boolean).join(' ') || 'unknown';
    return [
      'ACTIVE CUSTOMER (coach about this lead by name):',
      `- ${active.first_name} ${active.last_name}`,
      `- Current vehicle / trade: ${vehicle}${active.mileage ? `, ${active.mileage} mi` : ''}`,
      `- Lease end: ${active.lease_end_date ?? 'n/a'} | Heat: ${active.heat_tier ?? 'unscored'}`,
      `- Notes: ${active.notes ?? 'none'}`,
    ].join('\n');
  }
  if (contacts.length === 0) return '';
  const hot = contacts.filter(c => c.heat_tier === 'hot');
  const show = (hot.length ? hot : contacts).slice(0, 8);
  const list = show
    .map(c => `- ${c.first_name} ${c.last_name}${c.vehicle_make ? ` (${[c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ')})` : ''}${c.heat_tier === 'hot' ? ' · hot' : ''}`)
    .join('\n');
  return `THE REP'S BOOK (${contacts.length} contacts; use real names when relevant):\n${list}`;
}

const REX_SYSTEM = (repName: string, memory: string, contact: Contact | null, industry = 'auto') => `
You are Rex — a 30-year-old elite sales closer and AI coach. You're sharp, direct, and always moving the deal forward inch by inch. You don't give generic advice. You read the full situation, identify exactly where the deal stands, and give the rep their next concrete move.

You speak directly to ${repName || 'the rep'}, a ${INDUSTRY_CONFIG[industry]?.label ?? 'sales'} rep.
${memory ? `What you know about this rep:\n${memory}\n` : ''}
${contact ? `Active customer context:
Name: ${contact.first_name} ${contact.last_name}
Their Current Vehicle (Trade-In): ${[contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ') || 'not logged'}
Trade-In Mileage: ${contact.mileage ?? 'unknown'} | Annual: ${contact.annual_mileage ?? 'unknown'}
Lease end: ${contact.lease_end_date ?? 'N/A'}
Stage: ${contact.stage ?? 'unknown'} | Heat: ${contact.heat_tier ?? 'unscored'}
Buying Urgency: ${contact.buying_urgency ?? 'unknown'}
Notes: ${contact.notes ?? 'none'}
Rapport: ${contact.rapport_notes ?? 'none'}
Last Contact: ${contact.last_contact_date ?? 'never'}
Follow-up Date: ${contact.follow_up_date ?? 'none set'}
` : ''}
## HOW TO READ THE DEAL
* **Their Current Vehicle (Trade-In)**: What they drive now — the vehicle_year/make/model above. This is what they'd bring in. Use known mileage and age as context, but treat repair-cost or equity angles as possibilities unless the record actually proves them.
* **Vehicle of Interest (VOI)**: When the rep mentions a specific unit, stock #, or model they're presenting — that's the VOI. If not mentioned yet, ask what they're looking at.
* **Deal Stage**: Read the stage, heat tier, notes, last contact date. Where are we — fresh up, demo, numbers, objection, follow-up, gone cold?
* **Buying Signals**: Mileage creeping up, lease ending soon, high urgency, multiple visits, specific model requests, payment questions — but only when those signals are actually present in the record.
* **Blockers**: Credit concerns, negative equity on trade, payment too high, spouse approval, competitor shopping.

## YOUR JOB
1. Absorb ALL context — notes, vehicles, mileage, lease dates, stage, heat, urgency, rapport
2. Identify exactly where the deal is stuck or what the next inch forward looks like
3. Give a SPECIFIC next action — not "follow up" but the actual words to say or text to send
4. Always have a plan to advance: appointment → demo → write-up → close → delivery

## RULES
* Keep responses tight — 2-4 sentences max unless walking through a rebuttal or game plan
* When a contact is loaded, use their actual details — name, vehicle, trade, mileage, dates
* Give the ACTUAL WORDS to say — not advice about what to say
* If a needed fact is missing, ask one sharp question or make the language conditional. Never invent the missing fact.
* If a screenshot or image is shared, read every detail and coach on the next move
* Always look for a legitimate angle to save or advance the deal without making up urgency.
* Never invent lender counts, store traffic, competing buyers, hold/deposit policy, price-match authority, discounts, incentives, availability, trade value, equity, repair timing, vehicle-value claims, or appointment details.
* When trade and VOI are both known, compare the customer's actual use case, timing, known ownership context, and possible equity only as a question or conditional unless verified.
* Reference their trade by known facts (for example: "your Camry is at 87k, so let's compare keeping it versus moving now") without predicting repairs.
* Reference the VOI by known features or fit. Never claim it holds value better, is scarce, or has stronger demand unless that fact is in the provided context.
* If an exact lease end or mileage genuinely creates urgency, use the exact known fact. If it is inferred or incomplete, soften it instead of presenting it as certain.
* If the rep asks you to DO something in the app, respond with your advice AND append an action block

## ACTIONS
When the rep asks you to take action, end your message with:
<action>{"type":"mass_text","filter":{"vehicle_make":"Malibu"},"message":"Hey {{first_name}}, ..."}</action>
<action>{"type":"show_followups"}</action>

Action types:
- mass_text: rep says "send a text to [group] about [offer]" — fill filter (vehicle_make, stage) and message
- show_followups: rep says "who should I call today" or "who needs attention" — no filter needed
These are the only two actions you can take here. If the rep asks to log a
customer or start a sequence, tell them to do it from the Book or Sequences
tab — don't emit an action tag for anything other than the two above.
`.trim();

// ── Rebuttals data ────────────────────────────────────────────────────────────
// V1 is automotive-only (CURRENT_STATE_DECISIONS.md §1, §12: "not being
// positioned as ... a multi-industry sales tool for V1" / "premature
// multi-industry repositioning" is explicitly off-limits). The other ten
// industries this used to ship (Mortgage, Real Estate, HVAC, Staffing,
// Roofing, Fence, Door-to-Door, Insurance, Solar, B2B) were live, unguarded,
// pre-pivot content — fabricated market stats, invented financing terms,
// fake scarcity/urgency, and fake social proof that never went through the
// truthfulness pass Auto's rebuttals did (see "Keep Rex persuasive without
// inventing dealership facts"). Auto-only until a real multi-industry
// decision reintroduces the others with the same guardrails.
const REBUTTAL_INDUSTRIES = ['Auto'];

const REBUTTALS: Record<string, { objection: string; response: string }[]> = {
  'Auto': [
    { objection: 'The payment is too high', response: '"I hear you. Is the car right and the payment wrong, or is the car itself not worth that payment to you? If the car is right, tell me where you hoped to be and I’ll see what real options we have."' },
    { objection: "I need to think about it", response: '"Totally fair. What\'s the one thing holding you back right now? Let\'s just talk through that one thing."' },
    { objection: "I can get it cheaper online", response: '"That might be a better deal. Let’s compare the same car and the same total numbers side by side. If theirs really wins, I’ll tell you. What exactly are they showing you?"' },
    { objection: "My credit isn\'t great", response: '"Got it. Let’s not guess or promise anything before we see the real options. If you’re comfortable, let’s get the information in and find out exactly what we can work with."' },
    { objection: "I want to sleep on it", response: '"Absolutely. Before you leave, what are you hoping becomes clearer overnight: the car, the numbers, or the timing? If we solve that one thing right now, would you feel comfortable moving forward?"' },
  ],
};

export default function RexScreen() {
  const [segment, setSegment] = useState<'chat' | 'rebuttals'>('chat');
  const [rebuttalIndustry, setRebuttalIndustry] = useState('Auto');
  const [expandedRebuttal, setExpandedRebuttal] = useState<string | null>(null);
  const [aiRebuttals, setAiRebuttals] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<RexMessage[]>([]);
  const [memory, setMemory] = useState<RexMemory | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [pendingAction, setPendingAction] = useState<RexAction | null>(null);
  const [proactiveCoach, setProactiveCoach] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [rexRecording, setRexRecording] = useState(false);
  const listRef = useRef<FlatList>(null);
  const dictationRef = useRef<Dictation | null>(null);

  useFocusEffect(useCallback(() => {
    loadAll();
  }, []));

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: prof }, { data: msgs }, { data: mem }, { data: ctcts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('rex_messages').select('*').eq('user_id', user.id).order('created_at').limit(50),
      supabase.from('rex_memory').select('*').eq('user_id', user.id).single(),
      supabase.from('contacts').select('id,first_name,last_name,vehicle_year,vehicle_make,vehicle_model,mileage,annual_mileage,lease_end_date,notes,heat_tier').eq('user_id', user.id).order('last_name'),
    ]);

    if (prof) {
      setProfile(prof);
      // REBUTTAL_INDUSTRIES is Auto-only (V1 is automotive-only — see the
      // comment above it). A stale non-auto profiles.industry value from a
      // pre-pivot account must never point this at a tab that no longer
      // exists, so 'auto' is the only mapping left.
      if (prof.industry === 'auto') setRebuttalIndustry('Auto');
    }
    if (msgs) setMessages(msgs);
    if (mem) setMemory(mem);
    if (ctcts) setContacts(ctcts as Contact[]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    if (!AI_PROXY_URL) {
      alert('AI proxy not configured.');
      return;
    }

    const imageToSend = pendingImage;
    setInput('');
    setPendingImage(null);
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const displayText = imageToSend
      ? (text ? `[Screenshot] ${text}` : '[Screenshot shared]')
      : text;

    // Optimistic user message
    const userMsg: RexMessage = {
      id: Date.now().toString(),
      user_id: user.id,
      contact_id: activeContact?.id ?? null,
      role: 'user',
      content: displayText,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    // Persist user message
    await supabase.from('rex_messages').insert({
      user_id: user.id,
      contact_id: activeContact?.id ?? null,
      role: 'user',
      content: displayText,
    });

    // Build history for context (last 10 messages)
    const history = [...messages.slice(-10), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Build the final user message content — multimodal if image attached
    const lastUserContent: any = imageToSend
      ? [
          { type: 'image', source: { type: 'base64', media_type: imageToSend.mimeType, data: imageToSend.base64 } },
          { type: 'text', text: text || 'Here is a screenshot. What is your coaching advice based on this conversation?' },
        ]
      : text;

    const apiMessages = [
      ...history.slice(0, -1), // all but the last (user) message
      { role: 'user', content: lastUserContent },
    ];

    try {
      let rawReply: string;
      if (!imageToSend && !isActionIntent(text)) {
        // Coaching question → the real methodology engine on /brain: the SAME
        // path as the gold-orb RexCoach (buildCoachMessages + callBrain). 1200
        // tokens so the full structured answer comes back without truncation.
        // Only screenshots (vision) and explicit app-actions fall through to the
        // legacy compatibility branch below.
        const coachMessages = buildCoachMessages({
          history: messages.map(m => ({
            from: m.role === 'assistant' ? ('rex' as const) : ('user' as const),
            text: m.content,
          })),
          text,
          repContext: buildRexRepContext(contacts, activeContact),
        });
        rawReply = (await callBrain({ maxTokens: 1200, messages: coachMessages })).trim()
          || 'Rex hit an error. Try again.';
      } else {
        // Screenshot (needs vision) or an explicit app-action/inventory request →
        // use the legacy request contract. The server compatibility shim routes
        // text/actions to DeepSeek and images to the isolated vision stack.
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${AI_PROXY_URL}/gemini`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            model: REX_MODEL,
            max_tokens: 600,
            system: REX_SYSTEM(profile?.full_name ?? '', memory?.summary ?? '', activeContact, profile?.industry ?? 'auto'),
            messages: apiMessages,
          }),
        });
        const json = await res.json();
        rawReply = json.content?.[0]?.text ?? 'Rex hit an error. Try again.';
        const action = parseRexAction(rawReply);
        if (action) setPendingAction(action);
      }

      const replyText = stripActionTag(rawReply);

      const { data: savedReply } = await supabase.from('rex_messages').insert({
        user_id: user.id,
        contact_id: activeContact?.id ?? null,
        role: 'assistant',
        content: replyText,
      }).select().single();

      setMessages(prev => [...prev, savedReply ?? {
        id: Date.now().toString() + 'r',
        user_id: user.id,
        contact_id: null,
        role: 'assistant' as const,
        content: replyText,
        created_at: new Date().toISOString(),
      }]);

      // Elite: update rex memory every 5 messages
      if (profile?.plan === 'elite') {
        const totalMsgs = (memory?.message_count ?? 0) + 2;
        if (totalMsgs % 5 === 0) await buildMemory(user.id, totalMsgs);
        else await supabase.from('rex_memory').upsert({ user_id: user.id, message_count: totalMsgs });
      }

    } catch {
      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'e',
        user_id: user.id,
        contact_id: null,
        role: 'assistant' as const,
        content: 'Connection error. Check your network and API key.',
        created_at: new Date().toISOString(),
      }]);
    }

    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  // Summarise conversation into Rex memory (Elite)
  async function buildMemory(userId: string, count: number) {
    const { data: allMsgs } = await supabase.from('rex_messages').select('role,content').eq('user_id', userId).order('created_at').limit(30);
    if (!allMsgs) return;

    const transcript = allMsgs.map(m => `${m.role === 'user' ? 'Rep' : 'Rex'}: ${m.content}`).join('\n');
    const summary = await callBrain({
      maxTokens: 400,
      messages: [{
        role: 'user',
        content: `Summarise key facts about this sales rep from their conversation with Rex. Focus on their style, common customers, recurring challenges. Be concise.\n\n${transcript}`,
      }],
    }).catch(() => '');
    // A failed/empty AI summary must never overwrite the rep's existing saved
    // understanding — bail out instead (matches lib/v2/rexMemory.ts's guard).
    if (!summary || !summary.trim()) return;
    await supabase.from('rex_memory').upsert({ user_id: userId, summary, message_count: count });
  }

  // Fetch proactive coach card when a contact is selected
  async function fetchProactiveCoach(contact: Contact) {
    setProactiveCoach(null);
    try {
      const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ');
      const prompt = `In 2 sentences max, give the rep their immediate game plan for ${contact.first_name} ${contact.last_name}. Vehicle: ${vehicle || 'unknown'}. Lease end: ${contact.lease_end_date ?? 'unknown'}. Notes: ${contact.notes ?? 'none'}. Be direct — what to do next and the one thing to lead with. Never invent store policy, urgency, vehicle facts, financing facts, or customer history; if a needed fact is missing, make the angle conditional.`;
      const reply = await callBrain({ maxTokens: 250, messages: [{ role: 'user', content: prompt }] });
      setProactiveCoach(reply);
    } catch {
      setProactiveCoach(''); // clear loading state on error
    }
  }

  // Execute an action Rex proposed
  async function executeAction(action: RexAction) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPendingAction(null);

    if (action.type === 'show_followups') {
      const today = new Date().toISOString().split('T')[0];
      const { data: followUps } = await supabase
        .from('contacts')
        .select('id,first_name,last_name,follow_up_date,heat_tier,notes')
        .eq('user_id', user.id)
        .lte('follow_up_date', today)
        .not('follow_up_date', 'is', null)
        .order('follow_up_date')
        .limit(10);

      const hotContacts = contacts.filter(c => c.heat_tier === 'hot').slice(0, 5);
      const combined = [...(followUps ?? []), ...hotContacts.filter(h => !(followUps ?? []).find((f: any) => f.id === h.id))];

      const resultText = combined.length === 0
        ? "No follow-ups due today. Book looks good — want me to find who's gone cold?"
        : `📋 Today's follow-up list:\n\n${combined.slice(0, 8).map((c: any, i) => `${i + 1}. ${c.first_name} ${c.last_name}${c.heat_tier === 'hot' ? ' 🔥' : ''}`).join('\n')}`;

      const aiMsg: RexMessage = {
        id: Date.now().toString() + 'a',
        user_id: user.id, contact_id: null, role: 'assistant',
        content: resultText, created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
    }

    if (action.type === 'mass_text' && action.message) {
      const message = action.message;
      // Filter contacts based on action.filter
      let filtered = contacts;
      if (action.filter?.vehicle_make) {
        const vm = action.filter.vehicle_make.toLowerCase();
        filtered = filtered.filter(c => (c.vehicle_make ?? '').toLowerCase().includes(vm));
      }
      if (action.filter?.stage) {
        filtered = filtered.filter(c => c.stage === action.filter!.stage);
      }
      const recipients = filtered.filter(c => c.phone);

      if (recipients.length === 0) {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'a',
          user_id: user.id, contact_id: null, role: 'assistant',
          content: `No contacts with a phone number matched${action.filter?.vehicle_make ? ` "${action.filter.vehicle_make}"` : ''}.`,
          created_at: new Date().toISOString(),
        }]);
      } else {
        // Real send: open the composer per contact (same pattern as Smart
        // Blast) — {{first_name}} is substituted per recipient, never sent
        // literally. The rep already confirmed once on the pending-action
        // card; launchSms asks "did you send it?" for each individual text.
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'a',
          user_id: user.id, contact_id: null, role: 'assistant',
          content: `Opening the text composer for ${recipients.length} contact${recipients.length !== 1 ? 's' : ''}, one at a time. Confirm each send as it opens.`,
          created_at: new Date().toISOString(),
        }]);
        let sentCount = 0;
        let unsupported = false;
        for (const c of recipients) {
          const personalized = message.replace(/\{\{first_name\}\}/g, c.first_name || 'there');
          const result = await launchSms({
            contact_id: c.id,
            contact_name: `${c.first_name} ${c.last_name}`.trim(),
            phone: c.phone,
            message: personalized,
          });
          if (result === 'unsupported') {
            unsupported = true;
            break;
          }
          if (result === 'opened') sentCount++;
        }
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'b',
          user_id: user.id, contact_id: null, role: 'assistant',
          content: unsupported
            ? '📱 Open PocketRep on your phone to launch Messages. No remaining texts were marked sent.'
            : `✅ ${sentCount} of ${recipients.length} message${recipients.length !== 1 ? 's' : ''} confirmed sent.`,
          created_at: new Date().toISOString(),
        }]);
      }
    }

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  const isElite = profile?.plan === 'elite';

  async function pickImage() {
    if (!ImagePicker) {
      alert('Image picker not available in this build.');
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { alert('Allow photo access to share screenshots with Rex.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'images',
        base64: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        setPendingImage({
          base64: asset.base64!,
          mimeType: (asset.mimeType ?? 'image/jpeg') as string,
        });
      }
    } catch (e) {
      console.warn('Image picker error:', e);
    }
  }

  async function startRexVoice() {
    // Tap again while recording → stop and submit what was heard.
    if (rexRecording) {
      try { dictationRef.current?.stop(); } catch { /* ignore */ }
      return;
    }
    // On-device speech recognition: Web Speech API on web; iOS Speech framework /
    // Android SpeechRecognizer on native (see lib/v2/sttDictation). Replaces the
    // old expo-av -> /ai-proxy/whisper path (that route is a 501 stub) — speech
    // is transcribed on-device, no audio leaves the phone.
    if (!isDictationAvailable()) {
      alert('Voice input is not available on this device.');
      return;
    }
    try {
      const handle = await startDictation({
        onPartial: (t) => setInput(t),
        onFinal: (t) => {
          if (t) { setInput(t); setTimeout(() => send(), 100); }
        },
        onError: (msg) => {
          if (msg === 'unsupported') alert('Voice input is not available on this device.');
          setRexRecording(false);
          dictationRef.current = null;
        },
        onEnd: () => {
          setRexRecording(false);
          dictationRef.current = null;
        },
      });
      dictationRef.current = handle;
      setRexRecording(true);
    } catch (e) {
      console.warn('Rex voice start error:', e);
      setRexRecording(false);
      dictationRef.current = null;
    }
  }

  async function fetchAiRebuttal(key: string, objection: string, fallback: string, newAngle = false) {
    setAiLoading(key);
    try {
      const guardrails = `Never invent store policies, inventory demand, competing buyers, lender counts, financing approvals, hold/deposit rules, price-match authority, discounts, incentives, availability, trade values, repair timing, vehicle-value claims, or customer facts. If a fact is unknown, ask for it or phrase the angle conditionally.`;
      const prompt = newAngle
        ? `Give me a DIFFERENT fresh angle for this sales objection in the ${rebuttalIndustry} industry. Be direct, give the actual words to say, keep it under 3 sentences. ${guardrails}\n\nObjection: "${objection}"`
        : `Give me a sharp, specific rebuttal for this sales objection in the ${rebuttalIndustry} industry. Be direct, give the actual words to say, keep it under 3 sentences. ${guardrails}\n\nObjection: "${objection}"`;
      const text = (await callBrain({ maxTokens: 600, messages: [{ role: 'user', content: prompt }] })) || fallback;
      setAiRebuttals(prev => ({ ...prev, [key]: text }));
    } catch {
      setAiRebuttals(prev => ({ ...prev, [key]: fallback }));
    }
    setAiLoading(null);
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Rex</Text>
          <Text style={s.headerSub}>Your AI closer</Text>
        </View>
        {segment === 'chat' ? (
          <TouchableOpacity
            style={[s.contextBtn, activeContact && s.contextBtnActive]}
            onPress={() => setShowContactPicker(true)}
            activeOpacity={0.8}
          >
            <Text style={[s.contextBtnText, activeContact && { color: colors.gold }]}>
              {activeContact ? `📍 ${activeContact.first_name} ${activeContact.last_name}` : '+ Context'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Segment control */}
      <View style={s.segRow}>
        <TouchableOpacity
          style={[s.segBtn, segment === 'chat' && s.segBtnActive]}
          onPress={() => setSegment('chat')}
          activeOpacity={0.8}
        >
          <Text style={[s.segText, segment === 'chat' && s.segTextActive]}>💬 Coach Rex</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.segBtn, segment === 'rebuttals' && s.segBtnActive]}
          onPress={() => setSegment('rebuttals')}
          activeOpacity={0.8}
        >
          <Text style={[s.segText, segment === 'rebuttals' && s.segTextActive]}>🥊 Rebuttals</Text>
        </TouchableOpacity>
      </View>

      {segment === 'rebuttals' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.rebContainer}>
          {/* Industry tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.indRow} contentContainerStyle={s.indRowInner}>
            {REBUTTAL_INDUSTRIES.map(ind => (
              <TouchableOpacity
                key={ind}
                style={[s.indPill, rebuttalIndustry === ind && s.indPillActive]}
                onPress={() => { setRebuttalIndustry(ind); setExpandedRebuttal(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.indPillText, rebuttalIndustry === ind && s.indPillTextActive]}>{ind}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Objection cards */}
          {(REBUTTALS[rebuttalIndustry] ?? []).map((item, i) => {
            const cardKey = `${rebuttalIndustry}-${i}`;
            const isExpanded = expandedRebuttal === cardKey;
            const isLoadingThis = aiLoading === cardKey;
            const displayText = aiRebuttals[cardKey] ?? item.response;
            return (
              <TouchableOpacity
                key={i}
                style={[s.rebCard, isExpanded && s.rebCardExpanded]}
                onPress={() => {
                  if (isExpanded) { setExpandedRebuttal(null); return; }
                  setExpandedRebuttal(cardKey);
                  if (!aiRebuttals[cardKey]) fetchAiRebuttal(cardKey, item.objection, item.response);
                }}
                activeOpacity={0.85}
              >
                <View style={s.rebCardHeader}>
                  <Text style={s.objectionText}>"{item.objection}"</Text>
                  <Text style={s.rebChevron}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
                {isExpanded ? (
                  <View style={s.rebResponse}>
                    <Text style={s.rebLabel}>SAY THIS:</Text>
                    {isLoadingThis ? (
                      <ActivityIndicator color={colors.gold} style={{ marginVertical: 8 }} />
                    ) : (
                      <Text style={s.rebResponseText}>{displayText}</Text>
                    )}
                    {!isLoadingThis && (
                      <View style={s.rebActions}>
                        <TouchableOpacity
                          style={s.rebActionBtn}
                          onPress={() => Share.share({ message: displayText })}
                        >
                          <Text style={s.rebActionText}>Copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.rebActionBtn}
                          onPress={() => fetchAiRebuttal(cardKey, item.objection, item.response, true)}
                        >
                          <Text style={s.rebActionText}>New Angle</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <>
          {/* Memory banner (Elite) */}
          {isElite && memory?.summary ? (
            <View style={s.memBanner}>
              <Text style={s.memText}>🧠 Rex remembers you</Text>
            </View>
          ) : null}

          {/* Proactive coach card when contact selected */}
          {activeContact && proactiveCoach ? (
            <View style={s.coachCard}>
              <Text style={s.coachLabel}>🎯 Rex on {activeContact.first_name}</Text>
              <Text style={s.coachText}>{proactiveCoach}</Text>
            </View>
          ) : activeContact && !proactiveCoach ? (
            <View style={s.coachCard}>
              <ActivityIndicator size="small" color={colors.gold} />
              <Text style={[s.coachLabel, { marginLeft: 8 }]}>Rex is sizing up {activeContact.first_name}…</Text>
            </View>
          ) : null}

          {/* Pending action card */}
          {pendingAction ? (
            <View style={s.actionCard}>
              <Text style={s.actionCardTitle}>
                {pendingAction.type === 'mass_text' ? '📤 Rex wants to send a mass text' :
                 pendingAction.type === 'show_followups' ? '📋 Rex wants to pull your follow-up list' :
                 '⚡ Rex wants to take an action'}
              </Text>
              {pendingAction.message ? <Text style={s.actionCardMsg} numberOfLines={2}>"{pendingAction.message}"</Text> : null}
              {pendingAction.filter?.vehicle_make ? <Text style={s.actionCardSub}>Filter: {pendingAction.filter.vehicle_make} owners</Text> : null}
              <View style={s.actionCardBtns}>
                <TouchableOpacity style={s.actionCancelBtn} onPress={() => setPendingAction(null)} activeOpacity={0.8}>
                  <Text style={s.actionCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionConfirmBtn} onPress={() => executeAction(pendingAction)} activeOpacity={0.85}>
                  <Text style={s.actionConfirmText}>Confirm →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Messages */}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={s.msgList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🧠</Text>
                <Text style={s.emptyTitle}>Rex is ready.</Text>
                <Text style={s.emptySub}>Try: "Who should I call today?" or "Send a mass text to my Malibu customers about the $299 special"</Text>
              </View>
            }
            renderItem={({ item: m }) => (
              <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleRex]}>
                {m.role === 'assistant' && <Text style={s.rexLabel}>REX</Text>}
                <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.content}</Text>
              </View>
            )}
          />

          {loading && (
            <View style={s.typingRow}>
              <ActivityIndicator size="small" color={colors.gold} />
              <Text style={s.typingText}>Rex is typing…</Text>
            </View>
          )}
        </>
      )}

      {/* Input — only in chat mode */}
      {segment === 'chat' && (
        <View>
          {pendingImage && (
            <View style={s.imgPreviewRow}>
              <Text style={s.imgPreviewLabel}>📎 Screenshot attached</Text>
              <TouchableOpacity onPress={() => setPendingImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.imgPreviewRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={s.inputRow}>
            {ImagePicker && Platform.OS !== 'web' && (
              <TouchableOpacity style={s.attachBtn} onPress={pickImage} activeOpacity={0.7}>
                <Text style={s.attachBtnText}>📎</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.attachBtn, rexRecording && s.micRecording]} onPress={startRexVoice} activeOpacity={0.7}>
              <Text style={s.attachBtnText}>{rexRecording ? '🔴' : '🎤'}</Text>
            </TouchableOpacity>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={pendingImage ? 'Add a note (optional)…' : 'Ask Rex anything…'}
              placeholderTextColor={colors.grey}
              multiline
              maxLength={600}
              onSubmitEditing={send}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[s.sendBtn, ((!input.trim() && !pendingImage) || loading) && s.sendBtnDisabled]}
              onPress={send}
              disabled={(!input.trim() && !pendingImage) || loading}
            >
              <Text style={s.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Contact picker modal */}
      <Modal visible={showContactPicker} animationType="slide" transparent>
        <Pressable style={s.pickerOverlay} onPress={() => setShowContactPicker(false)}>
          <Pressable style={s.pickerSheet} onPress={e => e.stopPropagation()}>
            <View style={s.pickerHandle} />
            <Text style={s.pickerTitle}>Set customer context</Text>
            <Text style={s.pickerSub}>Rex will personalise rebuttals to this customer's notes.</Text>

            <TouchableOpacity
              style={[s.pickerRow, !activeContact && s.pickerRowActive]}
              onPress={() => { setActiveContact(null); setShowContactPicker(false); }}
            >
              <Text style={s.pickerRowText}>🚫 No context (general)</Text>
            </TouchableOpacity>

            {contacts.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[s.pickerRow, activeContact?.id === c.id && s.pickerRowActive]}
                onPress={() => { setActiveContact(c); setShowContactPicker(false); fetchProactiveCoach(c); }}
              >
                <Text style={s.pickerRowText}>
                  {c.first_name} {c.last_name}
                  {c.vehicle_make ? `  ·  ${[c.vehicle_year, c.vehicle_make].join(' ')}` : ''}
                </Text>
                {c.heat_tier === 'hot' ? <Text>🔥</Text> : null}
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  contextBtn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6,
  },
  contextBtnActive: { borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  contextBtnText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  memBanner: {
    backgroundColor: 'rgba(212,168,67,0.08)', borderBottomWidth: 1, borderBottomColor: colors.goldBorder,
    paddingHorizontal: spacing.lg, paddingVertical: 6,
  },
  memText: { color: colors.gold, fontSize: 11, fontWeight: '600' },
  msgList: { padding: spacing.lg, paddingBottom: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  bubble: {
    maxWidth: '85%', borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm,
  },
  bubbleUser: { backgroundColor: colors.gold, alignSelf: 'flex-end' },
  bubbleRex: { backgroundColor: colors.surface2, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.ink4 },
  rexLabel: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1, marginBottom: 4 },
  bubbleText: { color: colors.white, fontSize: 14, lineHeight: 21 },
  bubbleTextUser: { color: colors.ink },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  typingText: { color: colors.grey2, fontSize: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    padding: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: colors.ink2,
  },
  input: {
    flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md, padding: spacing.md, color: colors.white, fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.ink4 },
  sendBtnText: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  attachBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  attachBtnText: { fontSize: 16 },
  micRecording: { borderColor: 'rgba(255,60,60,0.6)', backgroundColor: 'rgba(255,60,60,0.12)' },
  imgPreviewRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.goldBg, borderTopWidth: 1, borderTopColor: colors.goldBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs,
  },
  imgPreviewLabel: { color: colors.gold2, fontSize: 12, fontWeight: '600' },
  imgPreviewRemove: { color: colors.grey2, fontSize: 16, fontWeight: '700' },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  pickerSheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, maxHeight: '70%',
  },
  pickerHandle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 4 },
  pickerSub: { fontSize: 12, color: colors.grey2, marginBottom: spacing.md },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderRadius: radius.sm, marginBottom: 4,
  },
  pickerRowActive: { backgroundColor: colors.goldBg },
  pickerRowText: { color: colors.grey3, fontSize: 14 },
  // Segment control
  segRow: {
    flexDirection: 'row', backgroundColor: colors.ink2,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: spacing.xs, gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  segBtn: {
    flex: 1, paddingVertical: 8, borderRadius: radius.lg, alignItems: 'center',
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
  },
  segBtnActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  segText: { color: colors.grey2, fontWeight: '700', fontSize: 13 },
  segTextActive: { color: colors.gold },
  // Rebuttals
  rebContainer: { padding: spacing.lg, paddingBottom: 40, gap: spacing.sm },
  indRow: { flexGrow: 0, marginBottom: spacing.sm },
  indRowInner: { gap: spacing.xs, paddingBottom: 4 },
  indPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  indPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  indPillText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  indPillTextActive: { color: colors.gold },
  rebCard: {
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.ink4, padding: spacing.md,
  },
  rebCardExpanded: { borderColor: colors.goldBorder },
  rebCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  objectionText: { color: colors.white, fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 },
  rebChevron: { color: colors.grey, fontSize: 11, marginLeft: 8 },
  rebResponse: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.ink4 },
  rebLabel: { fontSize: 9, fontWeight: '800', color: colors.gold, letterSpacing: 1, marginBottom: 6 },
  rebResponseText: { color: colors.grey2, fontSize: 13, lineHeight: 20 },
  rebActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  rebActionBtn: {
    backgroundColor: colors.ink4, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  rebActionText: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  // Proactive coach card
  coachCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(212,168,67,0.06)', borderBottomWidth: 1, borderBottomColor: colors.goldBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6,
  },
  coachLabel: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.5, marginBottom: 3 },
  coachText: { color: colors.grey3, fontSize: 13, lineHeight: 19 },
  // Action card
  actionCard: {
    margin: spacing.md, marginBottom: 0,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg, padding: spacing.md,
  },
  actionCardTitle: { color: colors.gold, fontWeight: '700', fontSize: 13, marginBottom: 4 },
  actionCardMsg: { color: colors.grey3, fontSize: 12, fontStyle: 'italic', marginBottom: 4 },
  actionCardSub: { color: colors.grey2, fontSize: 11, marginBottom: spacing.sm },
  actionCardBtns: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.md, padding: 8, alignItems: 'center' },
  actionCancelText: { color: colors.grey2, fontWeight: '600', fontSize: 12 },
  actionConfirmBtn: { flex: 2, backgroundColor: colors.gold, borderRadius: radius.md, padding: 8, alignItems: 'center' },
  actionConfirmText: { color: colors.ink, fontWeight: '700', fontSize: 12 },
});
