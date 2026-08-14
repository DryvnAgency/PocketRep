import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';
import { speak, stopSpeaking } from '@/lib/v2/speech';

type DemoContact = {
  id: string;
  first_name: string;
  last_name: string;
  vehicle: string | null;
  heat_score: number | null;
  next_step: string | null;
  plan_label: string | null;
  is_demo: boolean;
};

type Answers = { name: string; dealership: string; title: string; tone: string };
const EMPTY: Answers = { name: '', dealership: '', title: '', tone: '' };
const TONES = [
  { value: 'Direct', hint: 'straight to the point' },
  { value: 'Friendly', hint: 'warm, conversational' },
  { value: 'Hype', hint: 'high energy' },
  { value: 'Low-key', hint: 'calm, no pressure' },
];
const DEMO_NAMES = new Set(['Marcus Holloway', 'Sarah Thompson', 'Mike Rodriguez']);

export default function RexOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [demos, setDemos] = useState<DemoContact[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [practiceDone, setPracticeDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const current = demos[0];
  const first = answers.name.trim().split(/\s+/)[0] ?? '';
  const hot = useMemo(() => demos.filter(d => (d.heat_score ?? 0) >= 75), [demos]);

  useEffect(() => {
    if (!open) return;
    setStep(0); setAnswers(EMPTY); setPracticeDone(false); startedRef.current = false;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('contacts')
      .select('id, first_name, last_name, vehicle, heat_score, next_step, plan_label, is_demo')
      .eq('is_demo', true)
      .order('heat_score', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setDemos(((data ?? []) as DemoContact[]).filter(c => DEMO_NAMES.has(`${c.first_name} ${c.last_name}`)));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; stopSpeaking(); };
  }, [open]);

  useEffect(() => {
    if (!open || !startedRef.current) return;
    speak(stepLine(step, first));
    return () => stopSpeaking();
  }, [step, open]);

  if (!open) return null;

  const complete = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && answers.name.trim()) {
        await supabase.from('profiles').update({ full_name: answers.name.trim() }).eq('id', user.id);
      }
      if (answers.dealership.trim()) setRepSetting('dealership', answers.dealership.trim());
      if (answers.title.trim()) setRepSetting('title', answers.title.trim());
      if (answers.tone) setRepSetting('voiceTone', answers.tone);
    } catch { /* profile setup is best effort; do not trap the rep */ }
    finally {
      stopSpeaking(); setSaving(false); onClose();
      setTimeout(() => { setStep(0); setAnswers(EMPTY); }, 200);
    }
  };

  const skip = () => { stopSpeaking(); onClose(); };
  const start = () => { startedRef.current = true; setStep(1); };
  const next = () => setStep(s => Math.min(s + 1, 6));

  const progress = step / 6;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
        <Pressable onPress={skip} hitSlop={8}><Text style={styles.skip}>Skip</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.orbRow}><View style={styles.orb} /><Text style={styles.orbLabel}>REX</Text></View>

        {step === 0 ? (
          <>
            <Text style={styles.title}>Let's find your next deal.</Text>
            <Text style={styles.body}>I'm going to walk you through PocketRep using 3 sample customers already placed in your book. You'll learn the workflow by actually doing it.</Text>
            <View style={styles.callout}><Text style={styles.calloutTitle}>THE POCKETREP LOOP</Text><Text style={styles.calloutText}>Find who to contact → know what to say → send → sequence the follow-up → come back tomorrow.</Text></View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.eyebrow}>01 · YOUR SAMPLE BOOK</Text>
            <Text style={styles.title}>These 3 customers are your practice reps.</Text>
            <Text style={styles.body}>They belong only to your account and are marked DEMO. Nothing is sent to them.</Text>
            {loading ? <View style={styles.panel}><ActivityIndicator color={colors.gold} /></View> : <View style={styles.panel}>{demos.map(d => <DemoRow key={d.id} contact={d} />)}</View>}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.eyebrow}>02 · HEAT SHEET</Text>
            <Text style={styles.title}>Start every day with who matters most.</Text>
            <Text style={styles.body}>PocketRep prioritizes your book so you don't stare at 500 names wondering where to start.</Text>
            <View style={styles.panel}>
              {demos.map(d => <DemoRow key={d.id} contact={d} />)}
              <View style={styles.tip}><Text style={styles.tipText}>🔥 {hot.length || 1} HOT customer(s) get worked first. Then WARM and referral opportunities.</Text></View>
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={styles.eyebrow}>03 · WORK A CUSTOMER</Text>
            <Text style={styles.title}>Don't wonder what to say.</Text>
            <Text style={styles.body}>Open a customer, look at the context, then ask Rex for the next move. That's the core PocketRep workflow.</Text>
            {current ? <View style={styles.panel}><DemoRow contact={current} /><View style={styles.detail}><Text style={styles.detailLabel}>NEXT STEP</Text><Text style={styles.detailText}>{current.next_step}</Text></View><View style={styles.actions}><Action label="CALL" /><Action label="TEXT" /><Action label="ASK REX" /></View><Text style={styles.note}>This is practice only. DEMO customers can never receive a real message.</Text></View> : null}
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={styles.eyebrow}>04 · YOUR FIRST BLAST</Text>
            <Text style={styles.title}>Start with last month's sold customers.</Text>
            <Text style={styles.body}>When you import your real book, begin with the people you sold most recently. Review the message, send the blast, and put them into a follow-up sequence.</Text>
            <View style={styles.panel}>
              <View style={styles.blastHeader}><View><Text style={styles.panelTitle}>LAST 30 DAYS</Text><Text style={styles.muted}>{demos.length} sample customers</Text></View><Text style={styles.count}>{demos.length}</Text></View>
              {!practiceDone ? <Pressable onPress={() => setPracticeDone(true)} style={styles.primarySmall}><Text style={styles.primarySmallText}>PRACTICE THE BLAST</Text></Pressable> : <View style={styles.success}><Text style={styles.successTitle}>✓ You just learned the blast workflow.</Text><Text style={styles.successText}>Real customers will be reviewed, messaged, and enrolled into a sequence. These demo customers are never contacted.</Text></View>}
              <Text style={styles.panelTitle}>FOLLOW-UP SEQUENCE</Text><Text style={styles.sequence}>Today → 3 days → 7 days → 14 days → 30 days</Text>
            </View>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Text style={styles.eyebrow}>05 · BUILD YOUR BOOK</Text>
            <Text style={styles.title}>Then work backward through your past sales.</Text>
            <Text style={styles.body}>Don't try to attack your entire database at once. Start with last month, then expand until your old customers become a daily source of conversations.</Text>
            <View style={styles.panel}>{['Last month · START HERE', '60–90 days · NEXT', '3–6 months · NEXT', '6–12 months · NEXT'].map(x => <Text key={x} style={styles.month}>•  {x}</Text>)}</View>
            <View style={styles.callout}><Text style={styles.calloutTitle}>YOUR DAILY RHYTHM</Text><Text style={styles.calloutText}>Morning: work Heat Sheet. Midday: check replies. End of day: log activity. Tomorrow: Rex gives you the next list.</Text></View>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <Text style={styles.eyebrow}>06 · MAKE IT YOURS</Text>
            <Text style={styles.title}>One last thing and you're ready.</Text>
            <Text style={styles.body}>Tell Rex who you are so your messages sound like you. You can change these later.</Text>
            <View style={styles.form}>
              <Text style={styles.inputLabel}>YOUR NAME</Text><TextInput value={answers.name} onChangeText={v => setAnswers(a => ({ ...a, name: v }))} placeholder="Jake Morales" placeholderTextColor={colors.grey2} style={styles.input} />
              <Text style={styles.inputLabel}>DEALERSHIP</Text><TextInput value={answers.dealership} onChangeText={v => setAnswers(a => ({ ...a, dealership: v }))} placeholder="Bay Ridge Motors" placeholderTextColor={colors.grey2} style={styles.input} />
              <Text style={styles.inputLabel}>YOUR ROLE</Text><TextInput value={answers.title} onChangeText={v => setAnswers(a => ({ ...a, title: v }))} placeholder="Sales Consultant" placeholderTextColor={colors.grey2} style={styles.input} />
              <Text style={styles.inputLabel}>HOW SHOULD REX SOUND?</Text>
              <View style={styles.tones}>{TONES.map(t => <Pressable key={t.value} onPress={() => setAnswers(a => ({ ...a, tone: t.value }))} style={[styles.tone, answers.tone === t.value && styles.toneSelected]}><Text style={styles.toneValue}>{t.value}</Text><Text style={styles.toneHint}>{t.hint}</Text></Pressable>)}</View>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        {step === 0 ? <Pressable onPress={start} style={styles.primary}><Text style={styles.primaryText}>Let's do it</Text></Pressable> : step < 6 ? <Pressable onPress={next} style={styles.primary}><Text style={styles.primaryText}>{step === 4 && !practiceDone ? 'Next · Practice later' : `Next · ${step + 1}/6`}</Text></Pressable> : <Pressable onPress={complete} disabled={saving} style={[styles.primary, saving && { opacity: 0.6 }]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Go to Heat Sheet'}</Text></Pressable>}
      </View>
    </View>
  );
}

function stepLine(step: number, first: string) {
  const name = first || 'there';
  return [
    "Hey, I'm Rex. Let's find your next deal.",
    "I've added three sample customers. Let's see how your book works.",
    "This is the Heat Sheet. Start here every morning.",
    `Let's work ${name}'s first practice customer and figure out the next move.`,
    "Now let's practice the blast workflow.",
    "Work backward through your sold book and make follow-up a daily habit.",
    `Last step, ${name}. Let's make Rex sound like you.`,
  ][step];
}

function DemoRow({ contact }: { contact: DemoContact }) {
  const score = contact.heat_score ?? 0;
  const tier = score >= 75 ? 'HOT' : score >= 50 ? 'WARM' : 'REFERRAL';
  return <View style={styles.demoRow}><View style={[styles.stripe, { backgroundColor: score >= 75 ? colors.red : score >= 50 ? colors.orange : colors.gold }]} /><View style={styles.avatar}><Text style={styles.avatarText}>{contact.first_name[0]}{contact.last_name[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.demoName}>{contact.first_name} {contact.last_name}</Text><Text style={styles.demoVehicle}>{contact.vehicle}</Text></View><View style={styles.demoRight}><Text style={styles.tier}>{tier}</Text><Text style={styles.demo}>DEMO</Text></View></View>;
}
function Action({ label }: { label: string }) { return <View style={styles.action}><Text style={styles.actionText}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 95 } as any,
  top: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.ink4, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.gold } as any,
  skip: { color: colors.grey2, fontSize: 12, fontWeight: '600', paddingHorizontal: 8 },
  content: { padding: 24, paddingTop: 20, paddingBottom: 24, flexGrow: 1 },
  orbRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 22 },
  orb: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold },
  orbLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: colors.white, fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  body: { color: colors.grey3, fontSize: 14, lineHeight: 22, marginTop: 13 },
  panel: { marginTop: 20, padding: 12, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.xl, gap: 8 },
  callout: { marginTop: 20, padding: 13, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 12 },
  calloutTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  calloutText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 5 },
  demoRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: 10, overflow: 'hidden' },
  stripe: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  demoName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  demoVehicle: { color: colors.grey2, fontSize: 10, marginTop: 2 },
  demoRight: { alignItems: 'flex-end' },
  tier: { color: colors.gold, fontSize: 9, fontWeight: '800' },
  demo: { color: colors.grey2, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  tip: { padding: 10, backgroundColor: colors.goldBg, borderRadius: 9, borderWidth: 1, borderColor: colors.goldBorder },
  tipText: { color: colors.gold, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  detail: { padding: 10, backgroundColor: colors.surface2, borderRadius: 9, borderWidth: 1, borderColor: colors.ink4 },
  detailLabel: { color: colors.grey2, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  detailText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, paddingVertical: 9, backgroundColor: colors.goldBg, borderRadius: 8, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center' },
  actionText: { color: colors.gold, fontSize: 9, fontWeight: '800' },
  note: { color: colors.grey2, fontSize: 10, lineHeight: 16 },
  blastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  muted: { color: colors.grey2, fontSize: 10, marginTop: 3 },
  count: { color: colors.gold, fontSize: 30, fontWeight: '900' },
  primarySmall: { height: 44, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primarySmallText: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  success: { padding: 11, backgroundColor: colors.goldBg, borderRadius: 9, borderWidth: 1, borderColor: colors.goldBorder },
  successTitle: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  successText: { color: colors.grey3, fontSize: 10, lineHeight: 16, marginTop: 4 },
  sequence: { color: colors.white, fontSize: 12, fontWeight: '700', marginTop: 5 },
  month: { color: colors.white, fontSize: 12, fontWeight: '700', paddingVertical: 5 },
  form: { marginTop: 20, gap: 8 },
  inputLabel: { color: colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginTop: 5 },
  input: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: colors.white, fontSize: 14 } as any,
  tones: { gap: 6, marginTop: 2 },
  tone: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  toneSelected: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  toneValue: { color: colors.white, fontSize: 12, fontWeight: '700' },
  toneHint: { color: colors.grey2, fontSize: 9, marginTop: 2 },
  bottom: { paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 30, backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.ink4 },
  primary: { height: 48, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
});
