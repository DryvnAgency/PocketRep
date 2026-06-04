// Rex Coach — the tap-to-open text coaching chat (ported from
// design/extracted/tab-rex.jsx "Coach Mode"). This is the ONLY thing the gold
// orb opens. It's conversational coaching only: ask for scripts, rebuttals,
// objection role-play, next-move ideas. It never writes to the database —
// taking actions (add contact, log deal, etc.) is reserved for "Hey Rex" voice.

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import { callBrain, warmBrain } from '@/lib/v2/aiProxy';
import { serializeRepContext, loadMtdSummary, type MtdSummary } from '@/lib/v2/repContext';
import { buildCoachMessages } from '@/lib/v2/coachBrain';
import type { V2Contact } from '@/lib/v2/useContacts';
import type { PayPlan } from '@/lib/v2/payPlan';

type ChatMessage = { from: 'rex' | 'user'; text: string; time: string };

const QUICK_CHIPS = [
  "Payment's too high",
  'They want to think about it',
  'Lead went quiet — how do I follow up?',
  "What's my best move today?",
];

const COACH_OPENERS = [
  "Morning. What are we working on, a deal, a rebuttal, or your day?",
  "Quick read on your week, what do you want to sharpen first?",
  "I'm here. Throw me a customer situation and I'll give you the move.",
];

function stamp(): string {
  const n = new Date();
  return `${n.getHours()}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export default function RexCoach({
  open,
  onClose,
  contacts,
  payPlan,
}: {
  open: boolean;
  onClose: () => void;
  contacts: V2Contact[];
  payPlan: PayPlan | null;
}) {
  const greeting = useRef(COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  // Cold-start UX: after ~5s of waiting we tell the rep the function is warming;
  // on a transient failure we keep the text so a Retry button can re-send it.
  const [warming, setWarming] = useState(false);
  const [retry, setRetry] = useState<{ text: string; history: ChatMessage[] } | null>(null);
  const [mtd, setMtd] = useState<MtdSummary | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Seed a fresh greeting each time the sheet opens, and refresh month-to-date
  // numbers so coaching reflects the rep's current standing.
  useEffect(() => {
    if (open) {
      greeting.current = COACH_OPENERS[Math.floor(Math.random() * COACH_OPENERS.length)];
      setMessages([{ from: 'rex', text: greeting.current, time: stamp() }]);
      setInput('');
      setTyping(false);
      setWarming(false);
      setRetry(null);
      // Warm the brain function while the rep reads the greeting + types, so the
      // first real send lands on a warm container instead of a cold start.
      warmBrain();
      loadMtdSummary().then(setMtd).catch(() => setMtd(null));
    }
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, typing, open]);

  if (!open) return null;

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setRetry(null);
    const history = messages;
    setMessages(m => [...m, { from: 'user', text, time: stamp() }]);
    setInput('');
    await deliver(text, history);
  };

  // Runs one coach turn with cold-start resilience: flips to a "warming up" hint
  // after 5s, and on a transient (timeout/network) failure warms the function and
  // retries once — the retry lands on the now-warm container. On final failure it
  // stores the turn so the Retry button can re-send it.
  const deliver = async (text: string, history: ChatMessage[]) => {
    setTyping(true);
    setWarming(false);
    const warmTimer = setTimeout(() => setWarming(true), 5_000);
    const repContext = serializeRepContext({ contacts, payPlan, mtd });
    let attempt = 0;
    try {
      for (;;) {
        try {
          const reply = (await callBrain({
            // 1200 (was 700) so a complete, structured coaching answer never gets
            // cut off mid-sentence — the prompt still asks Rex to stay tight.
            maxTokens: 1200,
            messages: buildCoachMessages({ history, text, repContext }),
          })).trim();
          if (!reply) throw new Error('empty');
          setMessages(m => [...m, { from: 'rex', text: reply, time: stamp() }]);
          return;
        } catch (e: any) {
          const msg = String(e?.message ?? '');
          const transient = msg.includes('timeout') || msg.includes('network');
          if (attempt === 0 && transient) {
            attempt++;
            setWarming(true);
            await warmBrain();   // boot the container, then retry once
            continue;
          }
          throw e;
        }
      }
    } catch {
      setMessages(m => [...m, {
        from: 'rex',
        text: "Couldn't reach Rex just now — the assistant may be waking up. Tap Retry.",
        time: stamp(),
      }]);
      setRetry({ text, history });
    } finally {
      clearTimeout(warmTimer);
      setWarming(false);
      setTyping(false);
    }
  };

  const doRetry = () => {
    if (!retry || typing) return;
    const r = retry;
    setRetry(null);
    deliver(r.text, r.history);
  };

  return (
    <View style={StyleSheet.absoluteFillObject as any}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.live} />
          <Text style={styles.headerLabel}>REX · COACH</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={6}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.messages}>
          {messages.map((m, i) => (
            <View
              key={i}
              style={[styles.bubbleRow, { justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }]}
            >
              <View style={{ maxWidth: '84%' }}>
                {m.from === 'rex' ? <Label color={colors.gold}>REX · COACH</Label> : null}
                <View style={[styles.bubble, m.from === 'user' ? styles.bubbleUser : styles.bubbleRex]}>
                  <Text style={[styles.bubbleText, m.from === 'user' && { color: colors.white }]}>
                    {m.text}
                  </Text>
                </View>
                <Text style={[styles.time, { textAlign: m.from === 'user' ? 'right' : 'left' }]}>{m.time}</Text>
              </View>
            </View>
          ))}
          {typing ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, styles.bubbleRex, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <RadarLoader size={16} />
                <Text style={styles.bubbleText}>
                  {warming ? 'Warming up — first reply can take a few seconds…' : 'Rex is thinking…'}
                </Text>
              </View>
            </View>
          ) : null}
          {retry && !typing ? (
            <View style={[styles.bubbleRow, { justifyContent: 'flex-start' }]}>
              <Pressable onPress={doRetry} style={styles.retryBtn}>
                <Text style={styles.retryText}>↻ Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          {QUICK_CHIPS.map(chip => (
            <Pressable key={chip} onPress={() => send(chip)} style={styles.chip} disabled={typing}>
              <Text style={styles.chipText}>{chip}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Rex anything…"
            placeholderTextColor={colors.grey}
            style={styles.input}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            editable={!typing}
          />
          <Pressable
            onPress={() => send()}
            disabled={!input.trim() || typing}
            style={[styles.sendBtn, (!input.trim() || typing) && { opacity: 0.5 }]}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,8,0.8)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, top: '6%',
    backgroundColor: colors.ink,
    borderTopWidth: 1,
    borderTopColor: colors.goldBorder,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  } as any,
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.ink2,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  live: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.green,
  },
  headerLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1.4 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.grey2, fontSize: 14 },

  messages: { padding: 14, gap: 4 },
  bubbleRow: { flexDirection: 'row', paddingVertical: 6 },
  bubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  bubbleRex: { backgroundColor: colors.surface2, borderColor: colors.ink4, borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.grey3, lineHeight: 20, letterSpacing: -0.15 },
  time: { fontSize: 10, color: colors.grey, marginTop: 4 },

  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.goldBg,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.gold, letterSpacing: 0.3 },

  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6, gap: 8, alignItems: 'center' },
  chip: {
    alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.gold },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: colors.ink2,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
  },
  input: {
    flex: 1,
    backgroundColor: colors.ink3,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 11,
    color: colors.white, fontSize: 14,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  sendIcon: { color: colors.ink, fontSize: 16, fontWeight: '800' },
});
