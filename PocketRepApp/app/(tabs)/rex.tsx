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

// ── Model: Haiku for speed + cost on every Rex call ──────────────────────────
const REX_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

// Lazy-load expo-image-picker so a missing package never crashes the app
let ImagePicker: any = null;
try { ImagePicker = require('expo-image-picker'); } catch {}

// ── Action types Rex can execute ─────────────────────────────────────────────
interface RexAction {
  type: 'mass_text' | 'show_followups' | 'log_customer' | 'start_sequence';
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
* **Their Current Vehicle (Trade-In)**: What they drive now — the vehicle_year/make/model above. This is what they'd bring in. Factor in mileage, age, likely repair costs, equity position.
* **Vehicle of Interest (VOI)**: When the rep mentions a specific unit, stock #, or model they're presenting — that's the VOI. If not mentioned yet, ask what they're looking at.
* **Deal Stage**: Read the stage, heat tier, notes, last contact date. Where are we — fresh up, demo, numbers, objection, follow-up, gone cold?
* **Buying Signals**: Mileage creeping up, lease ending soon, high urgency, multiple visits, specific model requests, payment questions.
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
* Never say "I cannot" — find an angle or ask for more context
* If a screenshot or image is shared, read every detail and coach on the next move
* Always assume the deal can be saved. Find the angle.
* When trade and VOI are both known, factor in equity, payment spread, and emotional triggers (new car smell vs repair bills on the old one)
* Reference their trade by name ("your Camry has 87k — repairs start stacking around 100k") to make it real
* Reference the VOI by name ("that Civic Sport holds its value way better") to build excitement
* If mileage or lease end suggests urgency, USE IT — "3 months left on that lease, let's get ahead of it"
* If the rep asks you to DO something in the app, respond with your advice AND append an action block

## ACTIONS
When the rep asks you to take action, end your message with:
<action>{"type":"mass_text","filter":{"vehicle_make":"Malibu"},"message":"Hey {{first_name}}, ..."}</action>
<action>{"type":"show_followups"}</action>
<action>{"type":"log_customer","contact_name":"Marcus Webb"}</action>

Action types:
- mass_text: rep says "send a text to [group] about [offer]" — fill filter (vehicle_make, stage) and message
- show_followups: rep says "who should I call today" or "who needs attention" — no filter needed
- log_customer: rep describes a customer interaction in chat — extract and offer to log it
`.trim();

// ── Rebuttals data ────────────────────────────────────────────────────────────
const REBUTTAL_INDUSTRIES = ['Auto', 'Mortgage', 'Real Estate', 'HVAC', 'Staffing', 'Roofing', 'Fence', 'Door-to-Door', 'Insurance', 'Solar', 'B2B'];

const REBUTTALS: Record<string, { objection: string; response: string }[]> = {
  'Auto': [
    { objection: 'The payment is too high', response: '"I hear you — let me show you two options: we extend the term by 12 months or I find you a protection package that lowers the effective cost. Which sounds better?"' },
    { objection: "I need to think about it", response: '"Totally fair. What\'s the one thing holding you back right now? Let\'s just talk through that one thing."' },
    { objection: "I can get it cheaper online", response: '"You might find a lower sticker price, but factor in delivery fees, no trade-in value, and zero accountability after the sale. I can match within $300 and you drive it home today."' },
    { objection: "My credit isn\'t great", response: '"We work with 14 lenders — someone\'s going to say yes. The question is do you want to know the real number or keep guessing? Let\'s pull it and I\'ll tell you exactly where you stand."' },
    { objection: "I want to sleep on it", response: '"I respect that. Just so you know, this unit has had 3 people look at it this week. I can hold it with $500 fully refundable until tomorrow morning. Want me to do that?"' },
  ],
  'Mortgage': [
    { objection: 'The rate is too high', response: '"Compare it to what you\'re paying in rent — at this rate your payment builds equity. And rates drop, you refi. Rents never go down. Want me to run the 5-year comparison?"' },
    { objection: 'I\'m going to wait for rates to drop', response: '"If rates drop 1% on a $400K loan, that\'s $220/mo. But home prices went up $40K last year in your area. Waiting costs more than the rate does."' },
    { objection: 'I need 20% down', response: '"That\'s a myth for most buyers. FHA gets you in at 3.5%, conventional at 5%. PMI on a $400K loan is about $150/mo — less than rent appreciation. Let\'s run your options."' },
    { objection: 'Another lender offered less', response: '"Get it in writing and I\'ll beat it or tell you exactly why I can\'t and you should take their offer. Fair?"' },
  ],
  'Real Estate': [
    { objection: 'The price is too high', response: '"Let me pull the comps right now. If the data supports a lower offer, we write it that way. If it\'s priced right, I\'d rather you know before someone else takes it."' },
    { objection: 'I want to wait for the market to drop', response: '"The buyers who waited in 2021 paid more in 2022. The buyers who waited in 2022 paid more in 2023. The market doesn\'t wait — it rewards action."' },
    { objection: 'I need to sell mine first', response: '"We can write a contingency offer or I can connect you with a bridge loan option so you can move on this one now. What\'s your timeline to sell?"' },
    { objection: 'The inspection scared me', response: '"Every house has issues — the question is which ones are deal-killers vs. negotiating chips. Let\'s get a repair estimate and use it to renegotiate the price."' },
  ],
  'Insurance': [
    { objection: 'It\'s too expensive', response: '"What\'s your deductible right now? If I can show you a $40/mo savings with the same coverage and a lower deductible, that\'s worth 10 minutes. Can I run the comparison?"' },
    { objection: 'I\'m already covered', response: '"Being covered and being properly covered are different. When\'s the last time someone reviewed your policy against your current income and assets?"' },
    { objection: 'I need to talk to my spouse', response: '"Of course — what questions do you think they\'ll have? I can put together a one-pager that addresses those directly so the conversation takes 5 minutes instead of 30."' },
  ],
  'Solar': [
    { objection: 'The upfront cost is too high', response: '"The $0 down option locks in your current electricity rate for 25 years. Your utility just raised rates 8% — that\'s $0 vs. compounding increases. Which would you rather pay?"' },
    { objection: 'My roof needs work first', response: '"We actually partner with 3 roofing companies and bundle it. One loan, one payment, roof + solar. Want me to get a combined quote?"' },
    { objection: 'I\'m not sure I\'ll live here long enough', response: '"Solar adds $15K to $20K in home value and buyers pay more for homes with locked-in energy costs. It pays whether you stay or sell."' },
  ],
  'B2B': [
    { objection: 'We\'re happy with our current vendor', response: '"That\'s exactly why I\'m calling — clients who are happy use us as leverage on their current vendor. Can I show you what they\'re not offering you?"' },
    { objection: 'The budget isn\'t there right now', response: '"What\'s the cost of the problem I\'m solving? If it\'s more than my price, budget\'s not the issue — it\'s priority. What would need to change for this to be a priority?"' },
    { objection: 'Send me some information', response: '"I could, but 80% of the time it goes to the wrong folder. What specific problem are you hoping the information solves? Let me just address that directly."' },
    { objection: 'We need to involve procurement', response: '"Totally normal. What do they need to see to approve this category of spend? I\'ll build the deck around exactly that."' },
  ],
  'HVAC': [
    { objection: 'That\'s too expensive', response: '"Let me break down what you\'re actually paying right now — an inefficient system that\'s about to fail costs you in energy bills every month plus an emergency call at the worst possible time. What we\'re doing is replacing that risk with a known number. What part of the cost is the concern?"' },
    { objection: 'I want to get other quotes', response: '"Absolutely — you should. When you do, make sure you\'re comparing the same equipment tier and warranty. A lot of low bids use builder-grade equipment. I\'ll send you exactly what\'s in my quote so you can compare apples to apples."' },
    { objection: 'I need to talk to my spouse', response: '"Of course. What would help most — should I put together a one-page summary you can hand them, or would it be easier to do a quick call together so they can ask questions directly?"' },
    { objection: 'My system is still working', response: '"It is — for now. The question is whether you want to plan this on your schedule or wait until it goes out on the hottest day of the year when you\'re competing with 50 other emergency calls. I can\'t promise availability then. I can promise it now."' },
    { objection: 'Can you do better on the price?', response: '"What I can do is make sure you\'re getting the right system for your house — not the cheapest one. But let me look at the quote again and see if there\'s any flexibility on the install timing that might help."' },
  ],
  'Staffing': [
    { objection: 'We\'re not hiring right now', response: '"I hear you — but the best time to build the pipeline is before you need it. If you had a role open tomorrow, what would it be? I\'d rather have three people ready than be starting from zero when you\'re under pressure."' },
    { objection: 'We use another agency', response: '"That\'s fine — most companies we work with use more than one. What I\'d ask is: what\'s the one thing your current agency isn\'t delivering on? Speed, quality, fit? That\'s where I focus."' },
    { objection: 'Your rates are too high', response: '"Compare it to the cost of a bad hire — turnover, retraining, lost productivity. Our fill rate and retention at 90 days is [X]%. The math usually works out. Want me to send you the numbers?"' },
    { objection: 'We handle recruiting internally', response: '"A lot of our best clients do too. We\'re not a replacement — we handle overflow, specialized roles, or positions you need filled fast. What\'s the role that always takes the longest to fill?"' },
    { objection: 'We had a bad experience with a staffing agency', response: '"Tell me what happened. I\'m not going to tell you we\'re different without knowing what went wrong — but I\'d like to understand it so I can either tell you honestly if it\'d be different with us, or admit it wouldn\'t."' },
  ],
  'Roofing': [
    { objection: 'That\'s more than I expected to spend', response: '"I get it — it\'s not a fun expense. Here\'s what I\'d tell my own family: a roof that\'s done right lasts 25–30 years. Done cheap, you\'re looking at problems in 5–7. The difference in cost is a lot less than a second replacement. What part of the quote is the biggest concern?"' },
    { objection: 'I want to get other quotes', response: '"You should — 2 or 3 is smart. Just make sure they\'re using comparable shingles and the same underlayment. Ask each one about their warranty on labor, not just materials. That\'s where the difference shows up."' },
    { objection: 'Can my insurance cover it?', response: '"It might — especially if you\'ve had any hail or wind in the last year. I can do a quick storm damage inspection and if there\'s cause for a claim, I\'ll help you document it. A lot of our jobs come out at zero out-of-pocket for the homeowner. Worth checking."' },
    { objection: 'I\'m not sure I\'m ready to commit', response: '"That\'s fair. What would help you feel more comfortable — seeing examples of our work in your neighborhood, talking to a past customer, or getting more detail on the warranty? I\'d rather take the extra time now than have you unsure."' },
    { objection: 'I heard you use subcontractors', response: '"Our crews are trained and vetted — they work our jobs exclusively. I can introduce you to the crew lead before we start if that helps. Accountability runs through me regardless."' },
  ],
  'Fence': [
    { objection: 'That\'s more than I expected to spend', response: '"I hear that a lot. Here\'s the thing — a cheap fence either falls apart in 3–5 years or you\'re replacing boards constantly. The difference in cost between what we\'re quoting and a budget job pays for itself in maintenance alone. What part of the number is the biggest concern?"' },
    { objection: 'I want to get other quotes', response: '"You should — that\'s smart. When you compare, make sure they\'re using the same post depth, concrete footage, and material grade. That\'s where low bids cut corners. I\'ll put everything in writing so you can compare line by line."' },
    { objection: 'I need to talk to my spouse', response: '"Of course. Would it help if I put together a one-pager with the design, materials, and timeline so you\'re both looking at the same thing? Makes the conversation a lot easier."' },
    { objection: 'My neighbor said they got it cheaper', response: '"Possible — what did they get? Size, material, gate hardware all affect price. If we\'re comparing the same job, I\'ll match or tell you exactly why I can\'t. I\'d rather be honest than cheap."' },
    { objection: 'I\'m not sure about the design yet', response: '"No rush on that. I can show you 3–4 styles that work well with your yard type, and we can sit on it for a week. The price I\'m quoting today is locked in for 30 days — just wanted you to have it in hand while you\'re thinking."' },
  ],
  'Door-to-Door': [
    { objection: 'I\'m not interested', response: '"Totally respect that. Can I ask — is it this specifically, or is it just not a good time? I\'m not trying to change your mind right now, I just want to make sure I\'m not leaving before answering something that would\'ve mattered."' },
    { objection: 'I already have something like this', response: '"Good — then you know what it\'s supposed to do. What I\'d ask is: when\'s the last time someone actually reviewed what you have to make sure it\'s still the right fit? Things change. That\'s all I\'m here for."' },
    { objection: 'How do I know you\'re legit?', response: '"Fair question. Here\'s my ID badge, here\'s the company card with a number you can call right now, and I can show you a few neighbors on this street who\'ve already signed up. What would make you feel comfortable?"' },
    { objection: 'I need to talk to my spouse', response: '"Of course — I\'d expect that. What I can do is leave you with everything in writing so you\'re both looking at the same information. When would be a good time to come back when you\'re both home?"' },
    { objection: 'Just leave me your information', response: '"I will. And I\'ll be honest — most people who say that don\'t call, and I get it. So before I go, is there one question I can answer right now that would make this worth a 5-minute conversation?"' },
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
      // Default rebuttals tab to user's industry
      if (prof.industry) {
        const industryToRebuttal: Record<string, string> = {
          auto: 'Auto', mortgage: 'Mortgage', realestate: 'Real Estate',
          hvac: 'HVAC', staffing: 'Staffing', roofing: 'Roofing',
          fence: 'Fence', d2d: 'Door-to-Door', insurance: 'Insurance',
          solar: 'Solar', b2b: 'B2B',
        };
        const match = industryToRebuttal[prof.industry];
        if (match) setRebuttalIndustry(match);
      }
    }
    if (msgs) setMessages(msgs);
    if (mem) setMemory(mem);
    if (ctcts) setContacts(ctcts as Contact[]);
  }

  async function send() {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    if (!ANTHROPIC_KEY) {
      alert('Add your ANTHROPIC_KEY to .env to activate Rex.');
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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: REX_MODEL,
          max_tokens: 600,
          system: REX_SYSTEM(profile?.full_name ?? '', memory?.summary ?? '', activeContact, profile?.industry ?? 'auto'),
          messages: apiMessages,
        }),
      });

      const json = await res.json();
      const rawReply = json.content?.[0]?.text ?? 'Rex hit an error. Check your API key.';

      // Detect action intent from Rex reply
      const action = parseRexAction(rawReply);
      if (action) setPendingAction(action);
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
    if (!ANTHROPIC_KEY) return;
    const { data: allMsgs } = await supabase.from('rex_messages').select('role,content').eq('user_id', userId).order('created_at').limit(30);
    if (!allMsgs) return;

    const transcript = allMsgs.map(m => `${m.role === 'user' ? 'Rep' : 'Rex'}: ${m.content}`).join('\n');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: REX_MODEL,
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Summarise key facts about this sales rep from their conversation with Rex. Focus on their style, common customers, recurring challenges. Be concise.\n\n${transcript}`,
        }],
      }),
    });
    const json = await res.json();
    const summary = json.content?.[0]?.text ?? '';
    await supabase.from('rex_memory').upsert({ user_id: userId, summary, message_count: count });
  }

  // Fetch proactive coach card when a contact is selected
  async function fetchProactiveCoach(contact: Contact) {
    if (!ANTHROPIC_KEY) return;
    setProactiveCoach(null);
    try {
      const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ');
      const prompt = `In 2 sentences max, give the rep their immediate game plan for ${contact.first_name} ${contact.last_name}. Vehicle: ${vehicle || 'unknown'}. Lease end: ${contact.lease_end_date ?? 'unknown'}. Notes: ${contact.notes ?? 'none'}. Be direct — what to do next and the one thing to lead with.`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: REX_MODEL, max_tokens: 150, messages: [{ role: 'user', content: prompt }] }),
      });
      const rj = await res.json();
      setProactiveCoach(rj.content?.[0]?.text ?? '');
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
      // Filter contacts based on action.filter
      let filtered = contacts;
      if (action.filter?.vehicle_make) {
        const vm = action.filter.vehicle_make.toLowerCase();
        filtered = filtered.filter(c => (c.vehicle_make ?? '').toLowerCase().includes(vm));
      }
      if (action.filter?.stage) {
        filtered = filtered.filter(c => c.stage === action.filter!.stage);
      }

      const confirmMsg: RexMessage = {
        id: Date.now().toString() + 'a',
        user_id: user.id, contact_id: null, role: 'assistant',
        content: `✅ Mass text queued to ${filtered.length} contact${filtered.length !== 1 ? 's' : ''}${action.filter?.vehicle_make ? ` with a ${action.filter.vehicle_make}` : ''}.\n\nMessage: "${action.message?.replace('{{first_name}}', filtered[0]?.first_name ?? 'there')}"`,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, confirmMsg]);
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
    if (Platform.OS === 'web') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { alert('Voice input is not supported in this browser. Try Chrome.'); return; }
      const r = new SR();
      r.lang = 'en-US';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e: any) => {
        const t = e.results[0][0].transcript;
        setInput(t);
        setTimeout(() => send(), 100);
      };
      r.onerror = () => setRexRecording(false);
      r.onend = () => setRexRecording(false);
      r.start();
      setRexRecording(true);
      return;
    }
    // Native: use expo-av to record then transcribe via Whisper
    try {
      const { Audio } = require('expo-av');
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { alert('Microphone permission required.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRexRecording(true);
      // Auto-stop at 10 seconds
      setTimeout(async () => {
        try {
          await rec.stopAndUnloadAsync();
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
          const uri = rec.getURI();
          if (!uri) { setRexRecording(false); return; }
          const audioBlob = await fetch(uri).then(r => r.blob());
          const form = new FormData();
          form.append('file', audioBlob, 'rex_input.m4a');
          form.append('model', 'whisper-1');
          const wr = await fetch('https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy/whisper', {
            method: 'POST',
            body: form,
          });
          const wj = await wr.json();
          const text = wj.text ?? '';
          if (text) {
            setInput(text);
            setTimeout(() => send(), 100);
          }
        } catch (e) {
          console.warn('Rex voice error:', e);
        } finally {
          setRexRecording(false);
        }
      }, 10000);
    } catch (e) {
      console.warn('Rex voice start error:', e);
      setRexRecording(false);
    }
  }

  async function fetchAiRebuttal(key: string, objection: string, fallback: string, newAngle = false) {
    if (!ANTHROPIC_KEY) { setAiRebuttals(prev => ({ ...prev, [key]: fallback })); return; }
    setAiLoading(key);
    try {
      const prompt = newAngle
        ? `Give me a DIFFERENT fresh angle for this sales objection in the ${rebuttalIndustry} industry. Be direct, give the actual words to say, keep it under 3 sentences.\n\nObjection: "${objection}"`
        : `Give me a sharp, specific rebuttal for this sales objection in the ${rebuttalIndustry} industry. Be direct, give the actual words to say, keep it under 3 sentences.\n\nObjection: "${objection}"`;
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: REX_MODEL, max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text ?? fallback;
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
