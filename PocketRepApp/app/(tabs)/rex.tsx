import { useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Contact, RexMessage, RexMemory, Profile } from '@/lib/types';
import { INDUSTRY_CONFIG } from '@/lib/industryConfig';

// ── Gemini 2.5 Flash via Supabase Edge Function ───────────────────────────────
const REX_EDGE_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/rex-chat';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Lazy-load expo-image-picker
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

// Quick log extraction from Gemini response
function parseQuickLog(text: string): Record<string, string> | null {
  const match = text.match(/\[QUICK_LOG:([\s\S]*?)\]/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function stripQuickLog(text: string): string {
  return text.replace(/\[QUICK_LOG:[\s\S]*?\]/g, '').trim();
}

// ── Rex system prompt ─────────────────────────────────────────────────────────
const REX_SYSTEM = (repName: string, memory: string, contact: Contact | null, industry = 'auto') => `
You are Rex. A real sales coach who has been in the field for 30 years. You work inside PocketRep helping sales reps close more deals and stay in front of their book of business.

Your personality:
- Start responses with "hey" not "I"
- Never use dashes in your messages
- Keep it short and punchy unless writing a full script
- Sound like a coach texting from the sideline not a chatbot writing an essay
- Be direct, confident, specific
- Use the rep's actual customer names and data when you have it

Your jobs:
1. Extract contact info from voice notes or typed messages (name, product, budget, timeline, stage, objections)
2. Give tactical coaching on what to say and do next
3. Write personalized follow up texts and emails using real customer context
4. Answer pipeline questions using the rep's actual data
5. When you detect contact info, end your reply with: [QUICK_LOG:{"name":"...","product":"...","stage":"...","notes":"..."}]

When writing texts or emails:
- No dashes
- Casual and conversational
- Sound like the rep wrote it themselves
- Short paragraphs, never walls of text

[REP_CONTEXT]
Rep name: ${repName || 'the rep'}
Industry: ${INDUSTRY_CONFIG[industry]?.label ?? 'Sales'}
${memory ? `What you know about this rep:\n${memory}` : ''}
${contact ? `
Active customer context:
Name: ${contact.first_name} ${contact.last_name}
Trade-in vehicle: ${[contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ') || 'not logged'}
Mileage: ${contact.mileage ?? 'unknown'} | Annual: ${contact.annual_mileage ?? 'unknown'}
Lease end: ${contact.lease_end_date ?? 'N/A'}
Stage: ${contact.stage ?? 'unknown'} | Heat: ${contact.heat_tier ?? 'unscored'}
Buying urgency: ${contact.buying_urgency ?? 'unknown'}
Notes: ${contact.notes ?? 'none'}
` : ''}

When the rep asks you to DO something in the app, end your message with:
<action>{"type":"mass_text","filter":{"vehicle_make":"Malibu"},"message":"hey {{first_name}}, ..."}</action>
<action>{"type":"show_followups"}</action>
`.trim();

const QUICK_CHIPS = ['My Heat Sheet', 'Write a Script', 'How\'s My Month', 'Log a Contact'];

export default function RexScreen() {
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
  const nativeRecRef = useRef<any>(null);  // expo-av Recording instance
  const webRecRef = useRef<any>(null);     // web SpeechRecognition instance

  useFocusEffect(useCallback(() => {
    loadAll();
  }, []));

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: prof }, { data: msgs }, { data: mem }, { data: ctcts }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('rex_messages').select('*').eq('user_id', user.id).order('created_at').limit(40),
      supabase.from('rex_memory').select('*').eq('user_id', user.id).single(),
      supabase.from('contacts').select('id,first_name,last_name,vehicle_year,vehicle_make,vehicle_model,mileage,annual_mileage,lease_end_date,notes,heat_tier').eq('user_id', user.id).order('last_name'),
    ]);

    if (prof) setProfile(prof);
    if (msgs) setMessages(msgs);
    if (mem) setMemory(mem);
    if (ctcts) setContacts(ctcts as Contact[]);
  }

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if ((!text && !pendingImage) || loading) return;

    const imageToSend = pendingImage;
    setInput('');
    setPendingImage(null);
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const displayText = imageToSend
      ? (text ? `[Screenshot] ${text}` : '[Screenshot shared]')
      : text;

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

    await supabase.from('rex_messages').insert({
      user_id: user.id,
      contact_id: activeContact?.id ?? null,
      role: 'user',
      content: displayText,
    });

    const history = [...messages.slice(-10), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(REX_EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          message: text || 'Here is a screenshot. What is your coaching advice?',
          image_base64: imageToSend?.base64 ?? null,
          image_mime: imageToSend?.mimeType ?? null,
          conversation_history: history.slice(0, -1),
          user_id: user.id,
          system_prompt: REX_SYSTEM(profile?.full_name ?? '', memory?.summary ?? '', activeContact, profile?.industry ?? 'auto'),
        }),
      });

      const json = await res.json();
      const rawReply = json.reply ?? 'Rex hit an error — try again.';

      const action = parseRexAction(rawReply);
      if (action) setPendingAction(action);

      // Handle quick log extraction
      const quickLog = parseQuickLog(rawReply);
      const replyText = stripQuickLog(stripActionTag(rawReply));

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

      // Update memory count
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
        content: 'hey connection dropped — check your network and try again',
        created_at: new Date().toISOString(),
      }]);
    }

    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  async function buildMemory(userId: string, count: number) {
    const { data: allMsgs } = await supabase.from('rex_messages').select('role,content').eq('user_id', userId).order('created_at').limit(30);
    if (!allMsgs) return;
    const transcript = allMsgs.map(m => `${m.role === 'user' ? 'Rep' : 'Rex'}: ${m.content}`).join('\n');
    try {
      const res = await fetch(REX_EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          message: `Summarise key facts about this sales rep from their conversation with Rex. Focus on their style, common customers, recurring challenges. Be concise.\n\n${transcript}`,
          conversation_history: [],
          user_id: userId,
          system_prompt: 'You are a memory summarizer. Be concise.',
        }),
      });
      const json = await res.json();
      const summary = json.reply ?? '';
      await supabase.from('rex_memory').upsert({ user_id: userId, summary, message_count: count });
    } catch {}
  }

  async function fetchProactiveCoach(contact: Contact) {
    setProactiveCoach(null);
    const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ');
    try {
      const res = await fetch(REX_EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          message: `In 2 sentences max, give the rep their immediate game plan for ${contact.first_name} ${contact.last_name}. Vehicle: ${vehicle || 'unknown'}. Lease end: ${contact.lease_end_date ?? 'unknown'}. Notes: ${contact.notes ?? 'none'}. Be direct, start with hey.`,
          conversation_history: [],
          user_id: '',
          system_prompt: REX_SYSTEM('', '', contact, 'auto'),
        }),
      });
      const rj = await res.json();
      setProactiveCoach(rj.reply ?? '');
    } catch { setProactiveCoach(''); }
  }

  async function executeAction(action: RexAction) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setPendingAction(null);

    if (action.type === 'show_followups') {
      const today = new Date().toISOString().split('T')[0];
      const { data: followUps } = await supabase
        .from('contacts').select('id,first_name,last_name,follow_up_date,heat_tier,notes')
        .eq('user_id', user.id).lte('follow_up_date', today)
        .not('follow_up_date', 'is', null).order('follow_up_date').limit(10);
      const hotContacts = contacts.filter(c => c.heat_tier === 'hot').slice(0, 5);
      const combined = [...(followUps ?? []), ...hotContacts.filter(h => !(followUps ?? []).find((f: any) => f.id === h.id))];
      const resultText = combined.length === 0
        ? 'hey no follow-ups due today. book looks clean. want me to find who went cold?'
        : `hey here is your follow-up list for today\n\n${combined.slice(0, 8).map((c: any, i) => `${i + 1}. ${c.first_name} ${c.last_name}${c.heat_tier === 'hot' ? ' 🔥' : ''}`).join('\n')}`;
      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'a', user_id: user.id, contact_id: null,
        role: 'assistant', content: resultText, created_at: new Date().toISOString(),
      }]);
    }

    if (action.type === 'mass_text' && action.message) {
      let filtered = contacts;
      if (action.filter?.vehicle_make) {
        const vm = action.filter.vehicle_make.toLowerCase();
        filtered = filtered.filter(c => (c.vehicle_make ?? '').toLowerCase().includes(vm));
      }
      setMessages(prev => [...prev, {
        id: Date.now().toString() + 'a', user_id: user.id, contact_id: null,
        role: 'assistant',
        content: `hey mass text queued to ${filtered.length} contact${filtered.length !== 1 ? 's' : ''}${action.filter?.vehicle_make ? ` with a ${action.filter.vehicle_make}` : ''}\n\nmessage: "${action.message?.replace('{{first_name}}', filtered[0]?.first_name ?? 'there')}"`,
        created_at: new Date().toISOString(),
      }]);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  async function pickImage() {
    if (!ImagePicker) { alert('Image picker not available in this build.'); return; }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { alert('Allow photo access to share screenshots with Rex.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? 'images',
        base64: true, quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.base64) {
        const asset = result.assets[0];
        setPendingImage({ base64: asset.base64!, mimeType: (asset.mimeType ?? 'image/jpeg') as string });
      }
    } catch (e) { console.warn('Image picker error:', e); }
  }

  // ── Transcribe audio URI and send to Rex ─────────────────────────────────────
  async function transcribeAndSend(uri: string) {
    try {
      const audioBlob = await fetch(uri).then(r => r.blob());
      const form = new FormData();
      form.append('file', audioBlob, 'rex_input.m4a');
      form.append('model', 'whisper-1');
      const wr = await fetch('https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy/whisper', {
        method: 'POST', body: form,
      });
      const wj = await wr.json();
      const text = wj.text ?? '';
      if (text) { setInput(text); setTimeout(() => send(text), 100); }
    } catch (e) { console.warn('Rex transcription error:', e); }
  }

  // ── Mic toggle: tap once to start, tap again to stop ─────────────────────────
  async function toggleRexVoice() {
    // ── STOP ──────────────────────────────────────────────────────────────────
    if (rexRecording) {
      if (Platform.OS === 'web') {
        webRecRef.current?.stop();
        webRecRef.current = null;
        // onend handler will setRexRecording(false)
      } else {
        const rec = nativeRecRef.current;
        nativeRecRef.current = null;
        setRexRecording(false);
        if (rec) {
          try {
            await rec.stopAndUnloadAsync();
            const { Audio } = require('expo-av');
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
            const uri = rec.getURI();
            if (uri) await transcribeAndSend(uri);
          } catch (e) { console.warn('Rex stop error:', e); }
        }
      }
      return;
    }

    // ── START ─────────────────────────────────────────────────────────────────
    if (Platform.OS === 'web') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { alert('Voice input is not supported in this browser. Try Chrome.'); return; }
      const r = new SR();
      r.lang = 'en-US'; r.continuous = false; r.interimResults = false;
      r.onresult = (e: any) => {
        const t = e.results[0][0].transcript;
        setInput(t);
        setTimeout(() => send(t), 100);
      };
      r.onerror = () => { webRecRef.current = null; setRexRecording(false); };
      r.onend = () => { webRecRef.current = null; setRexRecording(false); };
      r.start();
      webRecRef.current = r;
      setRexRecording(true);
      return;
    }

    // Native
    try {
      const { Audio } = require('expo-av');
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { alert('Microphone permission required.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      nativeRecRef.current = rec;
      setRexRecording(true);
    } catch (e) {
      console.warn('Rex voice start error:', e);
      setRexRecording(false);
    }
  }

  const isElite = profile?.plan === 'elite';

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
        <TouchableOpacity
          style={[s.contextBtn, activeContact && s.contextBtnActive]}
          onPress={() => setShowContactPicker(true)}
          activeOpacity={0.8}
        >
          <Text style={[s.contextBtnText, activeContact && { color: colors.gold }]}>
            {activeContact ? `📍 ${activeContact.first_name} ${activeContact.last_name}` : '+ Context'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Memory banner (Elite) */}
      {isElite && memory?.summary ? (
        <View style={s.memBanner}>
          <Text style={s.memText}>🧠 Rex remembers you</Text>
        </View>
      ) : null}

      {/* Quick chips */}
      <View style={s.chipsRow}>
        {QUICK_CHIPS.map(chip => (
          <TouchableOpacity
            key={chip}
            style={s.chip}
            onPress={() => send(chip)}
            activeOpacity={0.8}
          >
            <Text style={s.chipText}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Proactive coach card */}
      {activeContact && proactiveCoach ? (
        <View style={s.coachCard}>
          <Text style={s.coachLabel}>🎯 Rex on {activeContact.first_name}</Text>
          <Text style={s.coachText}>{proactiveCoach}</Text>
        </View>
      ) : activeContact && proactiveCoach === null ? (
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
            <Text style={s.emptyIcon}>🎯</Text>
            <Text style={s.emptyTitle}>Rex is ready.</Text>
            <Text style={s.emptySub}>Ask anything. Upload a screenshot. Talk through a deal.</Text>
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

      {/* Input bar */}
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
          {/* Upload button — visible on all platforms */}
          {ImagePicker && (
            <TouchableOpacity style={s.attachBtn} onPress={pickImage} activeOpacity={0.7}>
              <Text style={s.attachBtnText}>📎</Text>
            </TouchableOpacity>
          )}
          {/* Mic toggle — tap to start, tap again to stop */}
          <TouchableOpacity
            style={[s.attachBtn, rexRecording && s.micRecording]}
            onPress={toggleRexVoice}
            activeOpacity={0.7}
          >
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
            returnKeyType="send"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[s.sendBtn, ((!input.trim() && !pendingImage) || loading) && s.sendBtnDisabled]}
            onPress={() => send()}
            disabled={(!input.trim() && !pendingImage) || loading}
          >
            <Text style={s.sendBtnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact picker modal */}
      <Modal visible={showContactPicker} animationType="slide" transparent>
        <Pressable style={s.pickerOverlay} onPress={() => setShowContactPicker(false)}>
          <Pressable style={s.pickerSheet} onPress={e => e.stopPropagation()}>
            <View style={s.pickerHandle} />
            <Text style={s.pickerTitle}>Set customer context</Text>
            <Text style={s.pickerSub}>Rex will personalise advice to this customer's notes.</Text>
            <TouchableOpacity
              style={[s.pickerRow, !activeContact && s.pickerRowActive]}
              onPress={() => { setActiveContact(null); setProactiveCoach(null); setShowContactPicker(false); }}
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
  chipsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  chip: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  chipText: { color: colors.grey3, fontSize: 12, fontWeight: '600' },
  msgList: { padding: spacing.lg, paddingBottom: 8, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  bubble: { maxWidth: '85%', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
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
    borderRadius: radius.md, padding: spacing.md, color: colors.white, fontSize: 14, maxHeight: 100,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
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
  coachCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(212,168,67,0.06)', borderBottomWidth: 1, borderBottomColor: colors.goldBorder,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 6,
  },
  coachLabel: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.5, marginBottom: 3 },
  coachText: { color: colors.grey3, fontSize: 13, lineHeight: 19 },
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
