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
const TOUR = [
  { tab: 'HEAT SHEET', title: 'Know who needs attention now.', body: 'Your daily priority list. Start here when you want the fastest answer to: who should I work next, and why?' },
  { tab: 'CONTACTS', title: 'Your book, with the story attached.', body: 'Search customers, keep notes and history, update tags, and open the full relationship before you reach out.' },
  { tab: 'REX', title: 'Your coach and next-move engine.', body: 'Ask Rex who to call, what to say, how to handle an objection, or open Work My Book for your call and text queues.' },
  { tab: 'SALES LOG', title: 'Log the win and keep score.', body: 'Save deliveries and outcomes so PocketRep can show your activity, momentum, and the customers that should come back around.' },
  { tab: 'SETTINGS / PROFILE', title: 'Make PocketRep yours.', body: 'Manage your store, industry, Rex style, install help, billing, support, and the preferences that shape your workflow.' },
];

function demoMessage(contact: DemoContact, index: number) {
  const first = contact.first_name || 'there';
  const vehicle = contact.vehicle || 'the vehicle we talked about';
  if (index === 0) return `Hey ${first}, quick check-in on the ${vehicle}. Still thinking about making a move?`;
  if (index === 1) return `Hey ${first}, wanted to circle back while I had a second. Want me to help you map out the next step on the ${vehicle}?`;
  return `Hey ${first}, I was working through my follow-ups and thought of you. Still want me keeping an eye out around the ${vehicle}?`;
}

function TabPreview({ tab }: { tab: string }) {
  const tabNames = ['HEAT', 'CONTACTS', 'REX', 'SALES', 'ME'];
  const active = tab === 'HEAT SHEET' ? 'HEAT' : tab === 'SETTINGS / PROFILE' ? 'ME' : tab === 'SALES LOG' ? 'SALES' : tab;

  return (
    <View style={styles.previewFrame}>
      <View style={styles.previewPhoneTop}>
        <View><Text style={styles.previewBrand}>POCKETREP</Text><Text style={styles.previewSub}>SCREEN PREVIEW</Text></View>
        <View style={styles.previewAvatar}><Text style={styles.previewAvatarText}>AC</Text></View>
      </View>

      {tab === 'HEAT SHEET' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Heat Sheet</Text><Text style={styles.previewGold}>5 NEED ATTENTION</Text></View>
        <View style={styles.previewStatRow}>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>2</Text><Text style={styles.previewStatLabel}>HOT</Text></View>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>2</Text><Text style={styles.previewStatLabel}>WARM</Text></View>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>1</Text><Text style={styles.previewStatLabel}>DUE</Text></View>
        </View>
        <View style={styles.previewRow}><View style={styles.previewHeatDot} /><View style={styles.previewGrow}><Text style={styles.previewName}>Marcus Holloway</Text><Text style={styles.previewMeta}>2026 Rogue SV · follow up today</Text></View><Text style={styles.previewScore}>82</Text></View>
        <View style={styles.previewRow}><View style={styles.previewWarmDot} /><View style={styles.previewGrow}><Text style={styles.previewName}>Sarah Thompson</Text><Text style={styles.previewMeta}>Altima SR · 4 days quiet</Text></View><Text style={styles.previewScore}>61</Text></View>
      </> : null}

      {tab === 'CONTACTS' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Contacts</Text><Text style={styles.previewGold}>YOUR BOOK</Text></View>
        <View style={styles.previewSearch}><Text style={styles.previewSearchText}>Search customers…</Text></View>
        <View style={styles.previewPills}><Text style={styles.previewPillActive}>ALL</Text><Text style={styles.previewPill}>HOT</Text><Text style={styles.previewPill}>WARM</Text><Text style={styles.previewPill}>COLD</Text></View>
        <View style={styles.previewRow}><View style={styles.previewInitial}><Text style={styles.previewInitialText}>MH</Text></View><View style={styles.previewGrow}><Text style={styles.previewName}>Marcus Holloway</Text><Text style={styles.previewMeta}>Rogue SV · Trade · Last touch 2d</Text></View></View>
        <View style={styles.previewRow}><View style={styles.previewInitial}><Text style={styles.previewInitialText}>ST</Text></View><View style={styles.previewGrow}><Text style={styles.previewName}>Sarah Thompson</Text><Text style={styles.previewMeta}>Altima SR · Sold customer</Text></View></View>
      </> : null}

      {tab === 'REX' ? <>
        <View style={styles.previewRexHead}><View style={styles.previewRexOrb} /><View><Text style={styles.previewTitle}>Rex</Text><Text style={styles.previewGold}>LIVE · READY</Text></View></View>
        <View style={styles.previewBubbleRex}><Text style={styles.previewBubbleText}>I found 5 people worth working today. Marcus is the strongest next move.</Text></View>
        <View style={styles.previewActionRow}><View style={styles.previewAction}><Text style={styles.previewActionTitle}>WORK MY BOOK</Text><Text style={styles.previewMeta}>Call + Text Queue</Text></View><View style={styles.previewAction}><Text style={styles.previewActionTitle}>ASK REX</Text><Text style={styles.previewMeta}>What should I say?</Text></View></View>
        <View style={styles.previewBubbleUser}><Text style={styles.previewBubbleText}>Give me a text for Marcus.</Text></View>
      </> : null}

      {tab === 'SALES LOG' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Sales Log</Text><Text style={styles.previewGold}>THIS MONTH</Text></View>
        <View style={styles.previewStatRow}>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>8</Text><Text style={styles.previewStatLabel}>DELIVERED</Text></View>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>$12.4k</Text><Text style={styles.previewStatLabel}>GROSS</Text></View>
          <View style={styles.previewStat}><Text style={styles.previewStatNum}>3</Text><Text style={styles.previewStatLabel}>SPLITS</Text></View>
        </View>
        <View style={styles.previewRow}><View style={styles.previewInitial}><Text style={styles.previewInitialText}>JT</Text></View><View style={styles.previewGrow}><Text style={styles.previewName}>Jordan Taylor</Text><Text style={styles.previewMeta}>2026 Rogue · Delivered today</Text></View><Text style={styles.previewGold}>SOLD</Text></View>
        <View style={styles.previewAdd}><Text style={styles.previewAddText}>+ LOG A SALE</Text></View>
      </> : null}

      {tab === 'SETTINGS / PROFILE' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Profile</Text><Text style={styles.previewGold}>YOUR POCKETREP</Text></View>
        <View style={styles.previewProfile}><View style={styles.previewProfileOrb}><Text style={styles.previewProfileText}>AC</Text></View><View><Text style={styles.previewName}>Alex Carter</Text><Text style={styles.previewMeta}>Sales Consultant · Automotive</Text></View></View>
        <View style={styles.previewSetting}><Text style={styles.previewName}>Rex style</Text><Text style={styles.previewGold}>SHARP ›</Text></View>
        <View style={styles.previewSetting}><Text style={styles.previewName}>Install PocketRep</Text><Text style={styles.previewMeta}>Home Screen ›</Text></View>
        <View style={styles.previewSetting}><Text style={styles.previewName}>Billing & support</Text><Text style={styles.previewMeta}>Manage ›</Text></View>
      </> : null}

      <View style={styles.previewTabs}>{tabNames.map(name => <View key={name} style={styles.previewTab}><View style={[styles.previewTabDot, name === active && styles.previewTabDotActive]} /><Text style={[styles.previewTabText, name === active && styles.previewTabTextActive]}>{name}</Text></View>)}</View>
    </View>
  );
}

export default function RexOnboarding({ open, onClose }: { open: boolean; onClose: (completed: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
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
    setTourIndex(0);
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

  const progress = ((step + 1) / 4) * 100;
  const replyContact = demos[0] ?? FALLBACK_DEMOS[0];
  const tour = TOUR[tourIndex];

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <Pressable onPress={() => step === 1 ? setStep(2) : onClose(false)} hitSlop={8}><Text style={styles.skip}>{step === 1 ? 'Skip tour' : 'Skip'}</Text></Pressable>
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
          <Text style={styles.eyebrow}>02 · WELCOME TO POCKETREP</Text>
          <Text style={styles.title}>See where everything lives.</Text>
          <Text style={styles.body}>Each step shows you what the real tab looks like and what you use it for. You can skip this anytime.</Text>
          <View style={styles.tourDots}>{TOUR.map((item, index) => <View key={item.tab} style={[styles.tourDot, index === tourIndex && styles.tourDotActive]} />)}</View>
          <TabPreview tab={tour.tab} />
          <View style={styles.tourCard}>
            <Text style={styles.tourKicker}>{tour.tab} · {tourIndex + 1} OF {TOUR.length}</Text>
            <Text style={styles.tourTitle}>{tour.title}</Text>
            <Text style={styles.tourBody}>{tour.body}</Text>
          </View>
          <View style={styles.tourNav}>
            <Pressable onPress={() => setTourIndex(i => Math.max(0, i - 1))} disabled={tourIndex === 0} style={[styles.secondary, tourIndex === 0 && styles.disabled]}><Text style={styles.secondaryText}>Back</Text></Pressable>
            <Pressable onPress={() => tourIndex < TOUR.length - 1 ? setTourIndex(i => i + 1) : setStep(2)} style={[styles.secondary, styles.secondaryStrong]}><Text style={styles.secondaryText}>{tourIndex < TOUR.length - 1 ? 'Next tab' : 'See the demo'}</Text></Pressable>
          </View>
        </> : null}
        {step === 2 ? <>
          <Text style={styles.eyebrow}>03 · YOUR DEMO BOOK</Text>
          <Text style={styles.title}>See PocketRep work before you add anything.</Text>
          <Text style={styles.body}>These are safe demo customers. Rex gives each person a different reason to reach out. Nothing here contacts a real customer.</Text>
          <View style={styles.panel}>{loading ? <ActivityIndicator color={colors.gold} /> : null}{demos.slice(0, 3).map((d, i) => <View key={d.id} style={styles.demoCard}><View style={styles.messageHead}><Text style={styles.demoName}>{d.first_name} {d.last_name}</Text><Text style={styles.demo}>DEMO</Text></View><Text style={styles.vehicle}>{d.vehicle || 'Sample customer'}</Text><Text style={styles.message}>{demoMessage(d, i)}</Text></View>)}</View>
          <View style={styles.callout}><Text style={styles.calloutTitle}>THE LOOP</Text><Text style={styles.calloutText}>Rex finds the reason → writes each customer differently → you control every send → PocketRep keeps the response and context with the customer.</Text></View>
        </> : null}
        {step === 3 ? <>
          <Text style={styles.eyebrow}>04 · THE A-HA</Text>
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
        {step === 0 ? <Pressable onPress={() => { void saveIdentity().then(ok => { if (ok) setStep(1); }); }} disabled={saving} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Next · Welcome to PocketRep'}</Text></Pressable> : null}
        {step === 2 ? <Pressable onPress={() => setStep(3)} style={styles.primary}><Text style={styles.primaryText}>Next · Run the demo Text Queue</Text></Pressable> : null}
        {step === 3 && !demoReplyVisible ? <Pressable onPress={runDemoBlast} disabled={demoBlastSent} style={[styles.primary, demoBlastSent && styles.disabled]}><Text style={styles.primaryText}>{demoBlastSent ? 'Waiting for the reply…' : `Run demo Text Queue · ${Math.min(demos.length, 3)}`}</Text></Pressable> : null}
        {step === 3 && demoReplyVisible ? <Pressable onPress={() => onClose(true)} style={styles.primary}><Text style={styles.primaryText}>Continue · install + build my 60-day book</Text></Pressable> : null}
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
  tourDots: { flexDirection: 'row', gap: 6, marginTop: 22 },
  tourDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ink4 },
  tourDotActive: { width: 24, backgroundColor: colors.gold },
  previewFrame: { marginTop: 14, padding: 10, paddingBottom: 8, minHeight: 278, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2, overflow: 'hidden' },
  previewPhoneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  previewBrand: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  previewSub: { color: colors.grey, fontSize: 6, fontWeight: '800', letterSpacing: 0.8, marginTop: 1 },
  previewAvatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  previewAvatarText: { color: colors.gold, fontSize: 7, fontWeight: '900' },
  previewHeadline: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  previewTitle: { color: colors.white, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  previewGold: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  previewStatRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  previewStat: { flex: 1, padding: 7, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewStatNum: { color: colors.white, fontSize: 13, fontWeight: '900' },
  previewStatLabel: { color: colors.grey, fontSize: 6, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  previewRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, marginBottom: 6, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewGrow: { flex: 1 },
  previewName: { color: colors.white, fontSize: 9, fontWeight: '800' },
  previewMeta: { color: colors.grey2, fontSize: 7, lineHeight: 10, marginTop: 2 },
  previewScore: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  previewHeatDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  previewWarmDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.grey2 },
  previewSearch: { height: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewSearchText: { color: colors.grey, fontSize: 8 },
  previewPills: { flexDirection: 'row', gap: 5, marginVertical: 7 },
  previewPill: { color: colors.grey2, fontSize: 6, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.surface2 },
  previewPillActive: { color: colors.gold, fontSize: 6, fontWeight: '900', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.goldBg },
  previewInitial: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink4 },
  previewInitialText: { color: colors.white, fontSize: 7, fontWeight: '900' },
  previewRexHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 8 },
  previewRexOrb: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold },
  previewBubbleRex: { maxWidth: '88%', padding: 9, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder },
  previewBubbleUser: { maxWidth: '75%', alignSelf: 'flex-end', padding: 9, marginTop: 7, borderRadius: 10, backgroundColor: colors.goldBg },
  previewBubbleText: { color: colors.white, fontSize: 8, lineHeight: 12 },
  previewActionRow: { flexDirection: 'row', gap: 6, marginTop: 7 },
  previewAction: { flex: 1, minHeight: 43, justifyContent: 'center', padding: 7, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewActionTitle: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.4 },
  previewAdd: { minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  previewAddText: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  previewProfile: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, marginBottom: 7, borderRadius: 9, backgroundColor: colors.surface2 },
  previewProfileOrb: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  previewProfileText: { color: colors.gold, fontSize: 9, fontWeight: '900' },
  previewSetting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34, paddingHorizontal: 9, marginBottom: 5, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewTabs: { flexDirection: 'row', paddingTop: 7, marginTop: 'auto', borderTopWidth: 1, borderTopColor: colors.ink4 },
  previewTab: { flex: 1, alignItems: 'center', gap: 2 },
  previewTabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.grey },
  previewTabDotActive: { width: 10, backgroundColor: colors.gold },
  previewTabText: { color: colors.grey, fontSize: 5, fontWeight: '800' },
  previewTabTextActive: { color: colors.gold },
  tourCard: { marginTop: 10, padding: 15, minHeight: 138, justifyContent: 'center', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2 },
  tourKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  tourTitle: { color: colors.white, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.4, marginTop: 8 },
  tourBody: { color: colors.grey3, fontSize: 13, lineHeight: 19, marginTop: 8 },
  tourNav: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondary: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  secondaryStrong: { borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  secondaryText: { color: colors.white, fontSize: 13, fontWeight: '800' },
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