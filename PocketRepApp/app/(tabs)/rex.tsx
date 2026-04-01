import { useState, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Pressable, ScrollView,
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

// ── Rebuttals data ────────────────────────────────────────────────────────────
const REBUTTAL_INDUSTRIES = ['Auto', 'Mortgage', 'Real Estate', 'Insurance', 'Solar', 'B2B'];

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
};

export default function RexScreen() {
  const [segment, setSegment] = useState<'chat' | 'rebuttals'>('chat');
  const [rebuttalIndustry, setRebuttalIndustry] = useState('Auto');
  const [expandedRebuttal, setExpandedRebuttal] = useState<string | null>(null);
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
          {(REBUTTALS[rebuttalIndustry] ?? []).map((item, i) => (
            <TouchableOpacity
              key={i}
              style={[s.rebCard, expandedRebuttal === `${rebuttalIndustry}-${i}` && s.rebCardExpanded]}
              onPress={() => setExpandedRebuttal(expandedRebuttal === `${rebuttalIndustry}-${i}` ? null : `${rebuttalIndustry}-${i}`)}
              activeOpacity={0.85}
            >
              <View style={s.rebCardHeader}>
                <Text style={s.objectionText}>"{item.objection}"</Text>
                <Text style={s.rebChevron}>{expandedRebuttal === `${rebuttalIndustry}-${i}` ? '▲' : '▼'}</Text>
              </View>
              {expandedRebuttal === `${rebuttalIndustry}-${i}` ? (
                <View style={s.rebResponse}>
                  <Text style={s.rebLabel}>SAY THIS:</Text>
                  <Text style={s.rebResponseText}>{item.response}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <>
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
        </>
      )}

      {/* Input — only in chat mode */}
      {segment === 'chat' && <View style={s.inputRow}>
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
      </View>}

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
});
