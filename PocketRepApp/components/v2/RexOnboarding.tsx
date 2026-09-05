import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';
import {
  EliteActionButton,
  EliteChoiceButton,
  OnboardingHeading,
  OnboardingPanel,
  OnboardingProgress,
  OnboardingScreen,
  RexOnboardingMark,
} from './EliteOnboardingChrome';
import { DemoContactCard, DemoQueuePanel, DemoQuickReplies, DemoReplyCard } from './EliteOnboardingDemo';

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
  { tab: 'REX', title: 'Your coach and next-move engine.', body: 'Ask Rex who to call, what to say, how to handle an objection, or open Work My Book for Recommended, Call Queue, and Text Queue.' },
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

function PreviewRow({ name, meta, accent }: { name: string; meta: string; accent?: string }) {
  return (
    <View style={styles.previewRow}>
      <View style={styles.previewAvatar}><Text style={styles.previewAvatarText}>{name.split(/\s+/).map(p => p[0]).slice(0, 2).join('')}</Text></View>
      <View style={styles.previewGrow}><Text style={styles.previewName}>{name}</Text><Text style={styles.previewMeta}>{meta}</Text></View>
      {accent ? <Text style={styles.previewGold}>{accent}</Text> : null}
    </View>
  );
}

function TabPreview({ tab }: { tab: string }) {
  const tabNames = ['HEAT', 'CONTACTS', 'REX', 'SALES', 'ME'];
  const active = tab === 'HEAT SHEET' ? 'HEAT' : tab === 'SETTINGS / PROFILE' ? 'ME' : tab === 'SALES LOG' ? 'SALES' : tab;
  return (
    <View style={styles.previewFrame}>
      <View style={styles.previewPhoneTop}>
        <View><Text style={styles.previewBrand}>POCKETREP</Text><Text style={styles.previewSub}>SCREEN PREVIEW</Text></View>
        <View style={styles.previewStatus}><View style={styles.readyDot} /><Text style={styles.previewStatusText}>READY</Text></View>
      </View>

      {tab === 'HEAT SHEET' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Heat Sheet</Text><Text style={styles.previewGold}>5 NEED ATTENTION</Text></View>
        <View style={styles.previewStats}><View style={styles.previewStat}><Text style={styles.previewStatNum}>2</Text><Text style={styles.previewMeta}>HOT</Text></View><View style={styles.previewStat}><Text style={styles.previewStatNum}>2</Text><Text style={styles.previewMeta}>WARM</Text></View><View style={styles.previewStat}><Text style={styles.previewStatNum}>1</Text><Text style={styles.previewMeta}>DUE</Text></View></View>
        <PreviewRow name="Marcus Holloway" meta="2026 Rogue SV · follow up today" accent="82" />
        <PreviewRow name="Sarah Thompson" meta="Altima SR · 4 days quiet" accent="61" />
      </> : null}

      {tab === 'CONTACTS' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Contacts</Text><Text style={styles.previewGold}>YOUR BOOK</Text></View>
        <View style={styles.previewSearch}><Text style={styles.previewMeta}>Search customers…</Text></View>
        <PreviewRow name="Marcus Holloway" meta="Rogue SV · Trade · Last touch 2d" />
        <PreviewRow name="Sarah Thompson" meta="Altima SR · Sold customer" />
      </> : null}

      {tab === 'REX' ? <>
        <View style={styles.previewRexHead}><View style={styles.previewRexOrb}><View style={styles.previewRexCore} /></View><View><Text style={styles.previewTitle}>Rex</Text><Text style={styles.previewGold}>READY</Text></View></View>
        <View style={styles.previewBubble}><Text style={styles.previewBubbleText}>I found 5 people worth working today. Marcus is the strongest next move.</Text></View>
        <View style={styles.previewSegments}><Text style={styles.previewSegmentActive}>RECOMMENDED</Text><Text style={styles.previewSegment}>CALL QUEUE</Text><Text style={styles.previewSegment}>TEXT QUEUE</Text></View>
        <View style={styles.previewAction}><Text style={styles.previewGold}>WORK MY BOOK</Text><Text style={styles.previewMeta}>Reason → draft → review → send</Text></View>
      </> : null}

      {tab === 'SALES LOG' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Sales Log</Text><Text style={styles.previewGold}>THIS MONTH</Text></View>
        <View style={styles.previewStats}><View style={styles.previewStat}><Text style={styles.previewStatNum}>8</Text><Text style={styles.previewMeta}>DELIVERED</Text></View><View style={styles.previewStat}><Text style={styles.previewStatNum}>$12.4k</Text><Text style={styles.previewMeta}>GROSS</Text></View></View>
        <PreviewRow name="Jordan Taylor" meta="2026 Rogue · Delivered today" accent="SOLD" />
        <View style={styles.previewAction}><Text style={styles.previewGold}>+ LOG A SALE</Text></View>
      </> : null}

      {tab === 'SETTINGS / PROFILE' ? <>
        <View style={styles.previewHeadline}><Text style={styles.previewTitle}>Profile</Text><Text style={styles.previewGold}>YOUR POCKETREP</Text></View>
        <PreviewRow name="Alex Carter" meta="Sales Consultant · Automotive" />
        <View style={styles.previewSetting}><Text style={styles.previewName}>Rex style</Text><Text style={styles.previewGold}>SHARP ›</Text></View>
        <View style={styles.previewSetting}><Text style={styles.previewName}>Install PocketRep</Text><Text style={styles.previewMeta}>Home Screen ›</Text></View>
        <View style={styles.previewSetting}><Text style={styles.previewName}>Sign out</Text><Text style={styles.previewMeta}>›</Text></View>
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
  const [quickReply, setQuickReply] = useState('');
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
    setQuickReply('');
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
      <OnboardingScreen>
        <View style={styles.top} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <OnboardingProgress step={step} total={4} onSkip={() => step === 1 ? setStep(2) : onClose(false)} skipLabel={step === 1 ? 'Skip tour' : 'Skip'} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <RexOnboardingMark />

          {step === 0 ? <View style={styles.section}>
            <OnboardingHeading eyebrow="01 · MAKE REX YOURS" title="Who are we working for?" body="Give Rex the basics first. He uses this to coach you and write like someone from your business, not a generic bot." />
            <OnboardingPanel>
              <Text style={styles.label}>YOUR NAME</Text>
              <TextInput value={answers.name} onChangeText={name => setAnswers(a => ({ ...a, name }))} placeholder="Your name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>STORE / COMPANY</Text>
              <TextInput value={answers.dealership} onChangeText={dealership => setAnswers(a => ({ ...a, dealership }))} placeholder="Your store or company" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>INDUSTRY</Text>
              <View style={styles.choiceWrap}>{INDUSTRIES.map(industry => <View key={industry} style={styles.choiceHalf}><EliteChoiceButton label={industry} selected={answers.industry === industry} onPress={() => setAnswers(a => ({ ...a, industry }))} /></View>)}</View>
              <Text style={styles.label}>ROLE · OPTIONAL</Text>
              <TextInput value={answers.title} onChangeText={title => setAnswers(a => ({ ...a, title }))} placeholder="Sales Consultant" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>REX STYLE</Text>
              <View style={styles.toneRow}>{TONES.map(t => <View key={t.value} style={styles.toneChoice}><EliteChoiceButton label={t.value} detail={t.hint} selected={answers.tone === t.value} onPress={() => setAnswers(a => ({ ...a, tone: t.value }))} /></View>)}</View>
            </OnboardingPanel>
          </View> : null}

          {step === 1 ? <View style={styles.section}>
            <OnboardingHeading eyebrow="02 · WELCOME TO POCKETREP" title="See where everything lives." body="Each step shows you what the real tab looks like and what you use it for. You can skip this anytime." />
            <View style={styles.tourDots}>{TOUR.map((item, index) => <View key={item.tab} style={[styles.tourDot, index === tourIndex && styles.tourDotActive]} />)}</View>
            <TabPreview tab={tour.tab} />
            <OnboardingPanel>
              <Text style={styles.tourKicker}>{tour.tab} · {tourIndex + 1} OF {TOUR.length}</Text>
              <Text style={styles.tourTitle}>{tour.title}</Text>
              <Text style={styles.tourBody}>{tour.body}</Text>
            </OnboardingPanel>
            <View style={styles.tourNav}>
              <View style={styles.navButton}><EliteActionButton label="Back" tone="neutral" disabled={tourIndex === 0} onPress={() => setTourIndex(i => Math.max(0, i - 1))} /></View>
              <View style={styles.navButton}><EliteActionButton label={tourIndex < TOUR.length - 1 ? 'Next tab' : 'See the demo'} tone="neutral" onPress={() => tourIndex < TOUR.length - 1 ? setTourIndex(i => i + 1) : setStep(2)} /></View>
            </View>
          </View> : null}

          {step === 2 ? <View style={styles.section}>
            <OnboardingHeading eyebrow="03 · YOUR DEMO BOOK" title="See PocketRep work before you add anything." body="These are safe demo customers. Rex gives each person a different reason to reach out. Nothing here contacts a real customer." />
            <DemoQueuePanel loading={loading}>
              {demos.slice(0, 3).map((d, i) => <DemoContactCard key={d.id} name={`${d.first_name} ${d.last_name}`} vehicle={d.vehicle} score={d.heat_score} message={demoMessage(d, i)} />)}
            </DemoQueuePanel>
            <View style={styles.callout}><Text style={styles.calloutTitle}>THE LOOP</Text><Text style={styles.calloutText}>Rex finds the reason → writes each customer differently → you control every send → PocketRep keeps the response and context with the customer.</Text></View>
          </View> : null}

          {step === 3 ? <View style={styles.section}>
            <OnboardingHeading eyebrow="04 · THE A-HA" title="Bring your real book back to life." body="Run the demo Text Queue. PocketRep will simulate one reply so you can see the loop. No message leaves your phone." />
            <DemoQueuePanel>{demos.slice(0, 3).map((d, i) => <DemoContactCard key={d.id} name={`${d.first_name} ${d.last_name}`} vehicle={d.vehicle} message={demoMessage(d, i)} />)}</DemoQueuePanel>
            {demoBlastSent && !demoReplyVisible ? <View style={styles.waiting}><ActivityIndicator color={colors.gold} size="small" /><Text style={styles.waitingText}>PocketRep is watching the demo book…</Text></View> : null}
            {demoReplyVisible ? <Animated.View style={{ opacity: replyAnim }}><DemoReplyCard name={`${replyContact.first_name} ${replyContact.last_name}`} message="Yeah I’m still interested. Can I swing by after work?" /></Animated.View> : null}
            {demoReplyVisible ? <>
              <DemoQuickReplies selected={quickReply} onSelect={setQuickReply} />
              {quickReply ? <View style={styles.draftPreview}><Text style={styles.draftKicker}>DRAFT PREPARED · REVIEW BEFORE SENDING</Text><Text style={styles.draftText}>{quickReply}</Text></View> : null}
              <View style={styles.callout}><Text style={styles.calloutTitle}>THAT IS THE POINT.</Text><Text style={styles.calloutText}>Next, put PocketRep on your home screen and load the last two months of customers you sold. Start with last month. Rex builds the personalized Text Queue; you review and control every send. Then work the month before.</Text></View>
            </> : null}
          </View> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={styles.bottom}>
          {step === 0 ? <EliteActionButton label="Next · Welcome to PocketRep" loading={saving} onPress={() => { void saveIdentity().then(ok => { if (ok) setStep(1); }); }} /> : null}
          {step === 2 ? <EliteActionButton label="Next · Run the demo Text Queue" onPress={() => setStep(3)} /> : null}
          {step === 3 && !demoReplyVisible ? <EliteActionButton label={demoBlastSent ? 'Waiting for the reply…' : `Run demo Text Queue · ${Math.min(demos.length, 3)}`} loading={demoBlastSent} onPress={runDemoBlast} /> : null}
          {step === 3 && demoReplyVisible ? <EliteActionButton label="Continue · install + build my 60-day book" onPress={() => onClose(true)} /> : null}
        </View>
      </OnboardingScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 95 } as any,
  top: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, flexGrow: 1 },
  section: { marginTop: 24, gap: 16 },
  label: { color: colors.grey2, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 12, marginBottom: 7 },
  input: { minHeight: 50, color: colors.white, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceHalf: { minWidth: '47%', flexGrow: 1 },
  toneRow: { flexDirection: 'row', gap: 8 },
  toneChoice: { flex: 1 },
  tourDots: { flexDirection: 'row', gap: 6 },
  tourDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ink4 },
  tourDotActive: { width: 24, backgroundColor: colors.gold },
  tourKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  tourTitle: { color: colors.white, fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.4, marginTop: 8 },
  tourBody: { color: colors.grey3, fontSize: 13, lineHeight: 19, marginTop: 8 },
  tourNav: { flexDirection: 'row', gap: 10 },
  navButton: { flex: 1 },
  callout: { padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  calloutTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  calloutText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 6 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: radius.md, backgroundColor: colors.surface2 },
  waitingText: { color: colors.grey3, fontSize: 12, fontWeight: '700' },
  draftPreview: { padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surface2 },
  draftKicker: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  draftText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 6 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, marginTop: 14 },
  bottom: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.ink4, backgroundColor: colors.ink },
  previewFrame: { padding: 11, minHeight: 286, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2, overflow: 'hidden' },
  previewPhoneTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 3, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  previewBrand: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  previewSub: { color: colors.grey, fontSize: 6, fontWeight: '800', letterSpacing: 0.8, marginTop: 1 },
  previewStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  previewStatusText: { color: colors.grey2, fontSize: 7, fontWeight: '900', letterSpacing: 0.8 },
  previewHeadline: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 11, marginBottom: 9 },
  previewTitle: { color: colors.white, fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  previewGold: { color: colors.gold, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  previewStats: { flexDirection: 'row', gap: 6, marginBottom: 7 },
  previewStat: { flex: 1, padding: 7, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewStatNum: { color: colors.white, fontSize: 13, fontWeight: '900' },
  previewRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 7, marginBottom: 6, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewAvatar: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  previewAvatarText: { color: colors.gold, fontSize: 7, fontWeight: '900' },
  previewGrow: { flex: 1 },
  previewName: { color: colors.white, fontSize: 9, fontWeight: '800' },
  previewMeta: { color: colors.grey2, fontSize: 7, lineHeight: 10, marginTop: 2 },
  previewSearch: { height: 31, justifyContent: 'center', paddingHorizontal: 10, marginBottom: 7, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewRexHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11, marginBottom: 9 },
  previewRexOrb: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surface2 },
  previewRexCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold },
  previewBubble: { maxWidth: '90%', padding: 9, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.goldBorder },
  previewBubbleText: { color: colors.white, fontSize: 8, lineHeight: 12 },
  previewSegments: { flexDirection: 'row', gap: 5, marginTop: 8 },
  previewSegment: { color: colors.grey2, fontSize: 6, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface2 },
  previewSegmentActive: { color: colors.gold, fontSize: 6, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.goldBg },
  previewAction: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 9, marginTop: 7, borderRadius: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewSetting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 35, paddingHorizontal: 9, marginBottom: 5, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4 },
  previewTabs: { flexDirection: 'row', paddingTop: 8, marginTop: 'auto', borderTopWidth: 1, borderTopColor: colors.ink4 },
  previewTab: { flex: 1, alignItems: 'center', gap: 2 },
  previewTabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.grey },
  previewTabDotActive: { width: 10, backgroundColor: colors.gold },
  previewTabText: { color: colors.grey, fontSize: 5, fontWeight: '800' },
  previewTabTextActive: { color: colors.gold },
});