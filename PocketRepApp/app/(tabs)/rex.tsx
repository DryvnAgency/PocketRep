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

// ── Model: Haiku for speed + cost on every Rex call ──────────────────────────
const REX_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

const REX_SYSTEM = (repName: string, memory: string, contact: Contact | null) => `
You are Rex — a sharp, no-BS AI sales assistant built into PocketRep. You speak directly to ${repName || 'the rep'} like a trusted closer, not a chatbot.

${memory ? `What you know about this rep:\n${memory}\n` : ''}
${contact ? `Active customer context:\nName: ${contact.first_name} ${contact.last_name}\nVehicle: ${[contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ') || 'not logged'}\nMileage: ${contact.mileage ?? 'unknown'} | Annual: ${contact.annual_mileage ?? 'unknown'}\nLease end: ${contact.lease_end_date ?? 'N/A'}\nNotes: ${contact.notes ?? 'none'}\n` : ''}
Rules:
- Short, punchy responses. No corporate filler.
- When giving rebuttals, make them specific to the customer's actual situation.
- Never say "I cannot" — find an angle or ask for more context.
- If asked for a rebuttal, give the actual words to say, not a strategy lecture.
`.trim();

export default function RexScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<RexMessage[]>([]);
  const [memory, setMemory] = useState<RexMemory | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
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

    if (prof) setProfile(prof);
    if (msgs) setMessages(msgs);
    if (mem) setMemory(mem);
    if (ctcts) setContacts(ctcts as Contact[]);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!ANTHROPIC_KEY) {
      alert('Add your ANTHROPIC_KEY to .env to activate Rex.');
      return;
    }

    setInput('');
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Optimistic user message
    const userMsg: RexMessage = {
      id: Date.now().toString(),
      user_id: user.id,
      contact_id: activeContact?.id ?? null,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    // Persist user message
    await supabase.from('rex_messages').insert({
      user_id: user.id,
      contact_id: activeContact?.id ?? null,
      role: 'user',
      content: text,
    });

    // Build history for context (last 10 messages)
    const history = [...messages.slice(-10), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

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
          system: REX_SYSTEM(profile?.full_name ?? '', memory?.summary ?? '', activeContact),
          messages: history,
        }),
      });

      const json = await res.json();
      const replyText = json.content?.[0]?.text ?? 'Rex hit an error. Check your API key.';

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
            {activeContact ? `📍 ${activeContact.first_name} ${activeContact.last_name}` : '+ Customer context'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Memory banner (Elite) */}
      {isElite && memory?.summary ? (
        <View style={s.memBanner}>
          <Text style={s.memText}>🧠 Rex remembers you</Text>
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
            <Text style={s.emptySub}>Try: "Give me a rebuttal for 'the payment is too high'" or "Who should I call today?"</Text>
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

      {/* Input */}
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Rex anything…"
          placeholderTextColor={colors.grey}
          multiline
          maxLength={600}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]} onPress={send} disabled={!input.trim() || loading}>
          <Text style={s.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>

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
                onPress={() => { setActiveContact(c); setShowContactPicker(false); }}
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
});
