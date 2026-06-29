// P2-R1: Rex voice onboarding — a short conversational first-run interview that
// replaces the static 8-slide carousel WHEN EXPO_PUBLIC_REX_ONBOARDING is on
// (default off → AppShell keeps rendering the carousel, see isRexOnboardingEnabled).
//
// Deliberately captures ONLY fields PocketRep actually consumes — name
// (profiles.full_name), dealership + title + Rex tone (repSettings) — so the
// interview never collects dead data (the same never-fabricate discipline as the
// rest of the app; "what you sell" / unit goals are intentionally out of v1
// because nothing reads them yet). Rex speaks each line on web (best-effort TTS,
// after the rep's first tap so autoplay is allowed).

import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, StyleSheet,
} from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';
import { speak, stopSpeaking } from '@/lib/v2/speech';

type ToneOption = { value: string; hint: string };
const TONES: ToneOption[] = [
  { value: 'Direct', hint: 'straight to the point' },
  { value: 'Friendly', hint: 'warm, conversational' },
  { value: 'Hype', hint: 'high energy' },
  { value: 'Low-key', hint: 'calm, no pressure' },
];

type Answers = { name: string; dealership: string; title: string; tone: string };
const EMPTY: Answers = { name: '', dealership: '', title: '', tone: '' };

// The scripted steps. Text steps collect a free-text answer; the tone step is a
// quick-pick; intro/done are framing. firstName is woven in once we have it.
type StepKind = 'intro' | 'text' | 'tone' | 'done';
type StepDef = {
  kind: StepKind;
  field?: keyof Answers;
  label?: string;
  placeholder?: string;
  optional?: boolean;
  line: (first: string) => string;
};

const STEPS: StepDef[] = [
  {
    kind: 'intro',
    line: () => "Hey, I'm Rex, your pocket sales assistant. Give me 30 seconds and I'll set things up around how you work.",
  },
  {
    kind: 'text', field: 'name', label: 'YOUR NAME', placeholder: 'Jake Morales',
    line: () => 'First, what should I call you?',
  },
  {
    kind: 'text', field: 'dealership', label: 'DEALERSHIP', placeholder: 'Bay Ridge Motors', optional: true,
    line: (first) => `Good to meet you, ${first || 'there'}. Which store are you at?`,
  },
  {
    kind: 'text', field: 'title', label: 'YOUR ROLE', placeholder: 'Sales Consultant', optional: true,
    line: () => "What's your role there?",
  },
  {
    kind: 'tone', field: 'tone',
    line: () => 'When I draft your texts and talk you through deals, how should I sound?',
  },
  {
    kind: 'done',
    line: (first) => `You're set${first ? `, ${first}` : ''}. Start your day on the Heat Sheet, I'll keep your hottest deals up top and tell you who to hit first.`,
  },
];

export default function RexOnboarding({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [draft, setDraft] = useState(''); // current text field buffer
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false); // a user gesture has happened → TTS allowed

  const s = STEPS[step];
  const first = answers.name.trim().split(/\s+/)[0] ?? '';

  // Speak Rex's line for each step once the rep has tapped at least once (web
  // autoplay needs a gesture). Best-effort; speak() no-ops off-web / unsupported.
  useEffect(() => {
    if (!open || !startedRef.current) return;
    speak(s.line(first));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open]);

  // Stop any in-flight speech if the sheet unmounts or closes.
  useEffect(() => {
    if (!open) stopSpeaking();
    return () => stopSpeaking();
  }, [open]);

  if (!open) return null;

  const reset = () => { setStep(0); setAnswers(EMPTY); setDraft(''); startedRef.current = false; };

  const finish = async () => {
    setSaving(true);
    try {
      const name = answers.name.trim();
      if (name) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
      }
      if (answers.dealership.trim()) setRepSetting('dealership', answers.dealership.trim());
      if (answers.title.trim()) setRepSetting('title', answers.title.trim());
      if (answers.tone) setRepSetting('voiceTone', answers.tone);
    } catch {
      // Field writes are best-effort — the rep can edit anything in Profile. Don't
      // trap them in onboarding if a write fails.
    } finally {
      stopSpeaking();
      setSaving(false);
      onClose();
      setTimeout(reset, 200);
    }
  };

  const skipAll = () => { stopSpeaking(); onClose(); setTimeout(reset, 200); };

  const advance = () => setStep(st => Math.min(st + 1, STEPS.length - 1));

  const onStart = () => { startedRef.current = true; advance(); };

  const submitText = () => {
    if (s.field) {
      const v = draft.trim();
      if (!v && !s.optional) return; // name is required
      setAnswers(a => ({ ...a, [s.field!]: v }));
    }
    setDraft('');
    advance();
  };

  const pickTone = (value: string) => {
    setAnswers(a => ({ ...a, tone: value }));
    startedRef.current = true;
    advance();
  };

  const progress = step / (STEPS.length - 1);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        {s.kind !== 'done' ? (
          <Pressable onPress={skipAll} hitSlop={6}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.orbRow}>
          <View style={styles.orb} />
          <Text style={styles.orbLabel}>REX</Text>
        </View>

        <Text style={styles.line}>{s.line(first)}</Text>

        {s.kind === 'text' ? (
          <View style={styles.inputWrap}>
            {s.label ? <Text style={styles.inputLabel}>{s.label}</Text> : null}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={s.placeholder}
              placeholderTextColor={colors.grey2}
              style={styles.input}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={submitText}
              onFocus={() => { startedRef.current = true; }}
            />
          </View>
        ) : null}

        {s.kind === 'tone' ? (
          <View style={styles.tones}>
            {TONES.map(t => (
              <Pressable key={t.value} style={styles.tone} onPress={() => pickTone(t.value)}>
                <Text style={styles.toneValue}>{t.value}</Text>
                <Text style={styles.toneHint}>{t.hint}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        {s.kind === 'intro' ? (
          <Pressable onPress={onStart} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Let's set up</Text>
          </Pressable>
        ) : null}

        {s.kind === 'text' ? (
          <View style={styles.row}>
            {s.optional ? (
              <Pressable onPress={() => { setDraft(''); advance(); }} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Skip</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={submitText}
              disabled={!s.optional && !draft.trim()}
              style={[styles.primaryBtn, !s.optional && !draft.trim() && { opacity: 0.4 }]}
            >
              <Text style={styles.primaryBtnText}>Next</Text>
            </Pressable>
          </View>
        ) : null}

        {s.kind === 'done' ? (
          <Pressable onPress={finish} disabled={saving} style={[styles.primaryBtn, saving && { opacity: 0.6 }]}>
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Go to Heat Sheet'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 95,
  } as any,
  top: {
    paddingTop: 24, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.ink4, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.gold } as any,
  skip: { fontSize: 12, fontWeight: '600', color: colors.grey2, paddingHorizontal: 8 },

  content: { padding: 24, paddingTop: 24, paddingBottom: 24, flexGrow: 1 },
  orbRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 22 },
  orb: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold },
  orbLabel: { fontSize: 11, fontWeight: '800', color: colors.gold, letterSpacing: 1.4 },

  line: { fontSize: 24, fontWeight: '800', color: colors.white, lineHeight: 32, letterSpacing: -0.5 },

  inputWrap: { marginTop: 28 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.2, marginBottom: 8 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 16, color: colors.white,
  } as any,

  tones: { marginTop: 26, gap: 8 },
  tone: {
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
  },
  toneValue: { fontSize: 15, fontWeight: '700', color: colors.white },
  toneHint: { fontSize: 12, color: colors.grey2, marginTop: 2 },

  bottom: {
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 30,
    backgroundColor: colors.ink,
    borderTopWidth: 1, borderTopColor: colors.ink4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryBtn: {
    flex: 1, height: 48, borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  ghostBtn: {
    height: 48, paddingHorizontal: 18, borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { color: colors.grey2, fontSize: 14, fontWeight: '700' },
});
