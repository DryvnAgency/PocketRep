import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';

type DemoContact = {
  id: string;
  first_name: string;
  last_name: string;
  vehicle: string | null;
  heat_score: number | null;
};

type Answers = { name: string; dealership: string; industry: string; title: string; tone: string };
const EMPTY: Answers = { name: '', dealership: '', industry: 'Automotive', title: '', tone: 'Sharp' };
const DEMO_NAMES = new Set(['Marcus Holloway', 'Sarah Thompson', 'Mike Rodriguez']);
const FALLBACK_DEMOS: DemoContact[] = [
  { id: 'demo-marcus', first_name: 'Marcus', last_name: 'Holloway', vehicle: '2026 Rogue SV', heat_score: 82 },
  { id: 'demo-sarah', first_name: 'Sarah', last_name: 'Thompson', vehicle: '2025 Altima SR', heat_score: 61 },
  { id: 'demo-mike', first_name: 'Mike', last_name: 'Rodriguez', vehicle: '2025 Pathfinder', heat_score: 42 },
];
const TONES = [
  { value: 'Steady', hint: 'calm and trusted' },
  { value: 'Sharp', hint: 'direct and confident' },
  { value: 'Fire', hint: 'high energy closer' },
];
const INDUSTRIES = ['Automotive', 'RV / Marine / Powersports', 'Real Estate', 'Other Sales'];

function demoMessage(contact: DemoContact, index: number) {
  const first = contact.first_name || 'there';
  const vehicle = contact.vehicle || 'the vehicle we talked about';
  if (index === 0) return `Hey ${first}, quick check-in on the ${vehicle}. Still thinking about making a move?`;
  if (index === 1) return `Hey ${first}, wanted to circle back while I had a second. Want me to help you map out the next step on the ${vehicle}?`;
  return `Hey ${first}, I was working through my follow-ups and thought of you. Still want me keeping an eye out around the ${vehicle}?`;
}

export default function RexOnboarding({ open, onClose }: { open: boolean; onClose: (completed: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [demos, setDemos] = useState<DemoContact[]>(FALLBACK_DEMOS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [demoBlastSent, setDemoBlastSent] = useState(false);
  const [demoReplyVisible, setDemoReplyVisible] = useState(false);
  const replyAnim = useRef(new Animated.Value(0)).current;
  const demoReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setAnswers(EMPTY);
    setError('');
    setDemoBlastSent(false);
    setDemoReplyVisible(false);
    setDemos(FALLBACK_DEMOS);
    replyAnim.setValue(0);
    if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    let cancelled = false;
    setLoading(true);
    supabase.from('contacts')
      .select('id,first_name,last_name,vehicle,heat_score')
      .eq('is_demo', true)
      .order('heat_score', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const live = ((data ?? []) as DemoContact[]).filter(c => DEMO_NAMES.has(`${c.first_name} ${c.last_name}`));
        if (live.length) setDemos(live.slice(0, 3));
        setLoading(false);
      }, () => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    };
  }, [open, replyAnim]);

  if (!open) return null;

  const saveIdentity = async () => {
    const name = answers.name.trim();
    const dealership = answers.dealership.trim();
    if (!name || !dealership) {
      setError('Add your name and store or company so Rex knows who he is working for.');
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No signed-in user');
      const { error: profileError } = await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
      if (profileError) throw profileError;
      await setRepSetting('dealership', dealership);
      await setRepSetting('industry', answers.industry || 'Automotive');
      if (answers.title.trim()) await setRepSetting('title', answers.title.trim());
      await setRepSetting('voiceTone', answers.tone || 'Sharp');
      return true;
    } catch {
      setError('Could not save your setup. Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runDemoBlast = () => {
    if (demoBlastSent) return;
    setDemoBlastSent(true);
    setDemoReplyVisible(false);
    replyAnim.setValue(0);
    if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    demoReplyTimerRef.current = setTimeout(() => {
      setDemoReplyVisible(true);
      Animated.spring(replyAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: false }).start();
    }, 1200);
  };

  const progress = ((step + 1) / 3) * 100;
  const replyContact = demos[0] ?? FALLBACK_DEMOS[0];

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <Pressable onPress={() => onClose(false)} hitSlop={8}><Text style={styles.skip}>Skip</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.rexRow}><View style={styles.orb} /><Text style={styles.rex}>REX</Text></View>
        {step === 0 ? <>
          <Text style={styles.eyebrow}>01 · MAKE REX YOURS</Text>
          <Text style={styles.title}>Who are we working for?</Text>
          <Text style={styles.body}>Give Rex the basics first. He uses this to coach you and write like someone from your business, not a generic bot.</Text>
          <View style={styles.form}>
            <Text style={styles.label}>YOUR NAME</Text><TextInput value={answers.name} onChangeText={name => setAnswers(a => ({ ...a, name }))} placeholder="Your name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
            <Text style={styles.label}>STORE / COMPANY</Text><TextInput value={answers.dealership} onChangeText={dealership => setAnswers(a => ({ ...a, dealership }))} placeholder="Your store or company" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
            <Text style={styles.label}>INDUSTRY</Text><View style={styles.wrap}>{INDUSTRIES.map(industry => <Pressable key={industry} onPress={() => setAnswers(a => ({ ...a, industry }))} style={[styles.chip, answers.industry === industry && styles.selected]}><Text style={[styles.chipText, answers.industry === industry && styles.selectedText]}>{industry}</Text></Pressable>)}</View>
            <Text style={styles.label}>ROLE · OPTIONAL</Text><TextInput value={answers.title} onChangeText={title => setAnswers(a => ({ ...a, title }))} placeholder="Sales Consultant" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
            <Text style={styles.label}>REX STYLE</Text><View style={styles.tones}>{TONES.map(t => <Pressable key={t.value} onPress={() => setAnswers(a => ({ ...a, tone: t.value }))} style={[styles.tone, answers.tone === t.value && styles.selected]}><Text style={[styles.toneName, answers.tone === t.value && styles.selectedText]}>{t.value}</Text><Text style={styles.toneHint}>{t.hint}</Text></Pressable>)}</View>
          </View>
        </> : null}
        {step === 1 ? <>
          <Text style={styles.eyebrow}>02 · YOUR DEMO BOOK</Text>
          <Text style={styles.title}>See PocketRep work before you add anything.</Text>
          <Text style={styles.body}>These are safe demo customers. Rex gives each person a different reason to reach out. Nothing here contacts a real customer.</Text>
          <View style={styles.panel}>{loading ? <ActivityIndicator color={colors.gold} /> : null}{demos.slice(0, 3).map((d, i) => <View key={d.id} style={styles.demoCard}><View style={styles.messageHead}><Text style={styles.demoName}>{d.first_name} {d.last_name}</Text><Text style={styles.demo}>DEMO</Text></View><Text style={styles.vehicle}>{d.vehicle || 'Sample customer'}</Text><Text style={styles.message}>{demoMessage(d, i)}</Text></View>)}</View>
          <View style={styles.callout}><Text style={styles.calloutTitle}>THE LOOP</Text><Text style={styles.calloutText}>Rex finds the reason → writes each customer differently → you control every send → PocketRep keeps the response and context with the customer.</Text></View>
        </> : null}
        {step === 2 ? <>
          <Text style={styles.eyebrow}>03 · THE A-HA</Text>
          <Text style={styles.title}>Bring your real book back to life.</Text>
          <Text style={styles.body}>Run the demo Text Queue. PocketRep will simulate one reply so you can see the loop. No message leaves your phone.</Text>
          <View style={styles.panel}>{demos.slice(0, 3).map((d, i) => <View key={d.id} style={styles.demoCard}><View style={styles.messageHead}><Text style={styles.demoName}>{d.first_name} {d.last_name}</Text><Text style={styles.demo}>DEMO</Text></View><Text style={styles.message}>{demoMessage(d, i)}</Text></View>)}</View>
          {demoBlastSent && !demoReplyVisible ? <View style={styles.waiting}><ActivityIndicator color={colors.gold} size="small" /><Text style={styles.body}>PocketRep is watching the demo book…</Text></View> : null}
          {demoReplyVisible ? <Animated.View style={[styles.reply, { opacity: replyAnim }]}><Text style={styles.replyKicker}>CUSTOMER REPLIED · DEMO</Text><Text style={styles.demoName}>{replyContact.first_name} {replyContact.last_name}</Text><Text style={styles.message}>Yeah I’m still interested. Can I swing by after work?</Text></Animated.View> : null}
          {demoReplyVisible ? <View style={styles.callout}><Text style={styles.calloutTitle}>THAT IS THE POINT.</Text><Text style={styles.calloutText}>Next, put PocketRep on your home screen and load the last two months of customers you sold. Start with last month. Rex builds the personalized Text Queue; you review and control every send. Then work the month before.</Text></View> : null}
        </> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.bottom}>
        {step === 0 ? <Pressable onPress={() => { void saveIdentity().then(ok => { if (ok) setStep(1); }); }} disabled={saving} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Next · See my demo book'}</Text></Pressable> : null}
        {step === 1 ? <Pressable onPress={() => setStep(2)} style={styles.primary}><Text style={styles.primaryText}>Next · Run the demo Text Queue</Text></Pressable> : null}
        {step === 2 && !demoReplyVisible ? <Pressable onPress={runDemoBlast} disabled={demoBlastSent} style={[styles.primary, demoBlastSent && styles.disabled]}><Text style={styles.primaryText}>{demoBlastSent ? 'Waiting for the reply…' : `Run demo Text Queue · ${Math.min(demos.length, 3)}`}</Text></Pressable> : null}
        {step === 2 && demoReplyVisible ? <Pressable onPress={() => onClose(true)} style={styles.primary}><Text style={styles.primaryText}>Continue · install + build my 60-day book</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 95 } as any,
  top: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.ink4, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: colors.gold },
  skip: { color: colors.grey2, fontSize: 12, fontWeight: '600', paddingHorizontal: 8 },
  content: { padding: 24, paddingTop: 18, paddingBottom: 26, flexGrow: 1 },
  rexRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 20 },
  orb: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold },
  rex: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: colors.white, fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  body: { color: colors.grey3, fontSize: 14, lineHeight: 22, marginTop: 12 },
  form: { marginTop: 20, gap: 8 },
  label: { color: colors.grey2, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 5 },
  input: { minHeight: 48, color: colors.white, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, paddingHorizontal: 13, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  chipText: { color: colors.grey2, fontSize: 11, fontWeight: '700' },
  selected: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  selectedText: { color: colors.gold },
  tones: { flexDirection: 'row', gap: 8 },
  tone: { flex: 1, padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  toneName: { color: colors.grey3, fontSize: 12, fontWeight: '800' },
  toneHint: { color: colors.grey, fontSize: 9, lineHeight: 13, marginTop: 3 },
  panel: { marginTop: 18, padding: 12, gap: 8, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2 },
  demoCard: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  messageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  demoName: { color: colors.white, fontSize: 12, fontWeight: '800' },
  demo: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  vehicle: { color: colors.grey2, fontSize: 10, marginBottom: 6 },
  message: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 3 },
  callout: { marginTop: 16, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  calloutTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  calloutText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 5 },
  waiting: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  reply: { marginTop: 16, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.ink2 },
  replyKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, marginTop: 14 },
  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.ink4 },
  primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.gold },
  primaryText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
