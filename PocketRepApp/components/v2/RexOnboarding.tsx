import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';
import { createContact } from '@/lib/v2/updateContact';
import { markSoldBookNudgeSeen } from '@/lib/v2/rexSettings';

type DemoContact = {
  id: string;
  first_name: string;
  last_name: string;
  vehicle: string | null;
  heat_score: number | null;
  next_step: string | null;
  is_demo: boolean;
};

type Answers = { name: string; dealership: string; industry: string; title: string; tone: string };
const EMPTY: Answers = { name: '', dealership: '', industry: 'Automotive', title: '', tone: 'Sharp' };
const DEMO_NAMES = new Set(['Marcus Holloway', 'Sarah Thompson', 'Mike Rodriguez']);
const TONES = [
  { value: 'Steady', hint: 'calm and trusted' },
  { value: 'Sharp', hint: 'direct and confident' },
  { value: 'Fire', hint: 'high energy closer' },
];
const INDUSTRIES = ['Automotive', 'RV / Marine / Powersports', 'Real Estate', 'Other Sales'];
const DEMO_REPLIES = [
  'Yeah I’m still interested. Can I swing by after work?',
  'Perfect timing — I was actually thinking about this today.',
  'Appreciate you reaching out. What do you have available right now?',
];

function demoMessage(contact: DemoContact, index: number): string {
  const first = contact.first_name || 'there';
  const vehicle = contact.vehicle || 'the vehicle we talked about';
  if (index === 0) return `Hey ${first}, quick check-in on the ${vehicle}. Still thinking about making a move?`;
  if (index === 1) return `Hey ${first}, wanted to circle back while I had a second. Want me to help you map out the next step on the ${vehicle}?`;
  return `Hey ${first}, I was working through my follow-ups and thought of you. Still want me keeping an eye out around the ${vehicle}?`;
}

export default function RexOnboarding({ open, onClose }: { open: boolean; onClose: (completed: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [demos, setDemos] = useState<DemoContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [demoBlastSent, setDemoBlastSent] = useState(false);
  const [demoReplyVisible, setDemoReplyVisible] = useState(false);
  const [firstCustomerName, setFirstCustomerName] = useState('');
  const [firstCustomerPhone, setFirstCustomerPhone] = useState('');
  const [firstCustomerVehicle, setFirstCustomerVehicle] = useState('');
  const replyAnim = useRef(new Animated.Value(0)).current;
  const demoReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setAnswers(EMPTY);
    setError('');
    setDemoBlastSent(false);
    setDemoReplyVisible(false);
    setFirstCustomerName('');
    setFirstCustomerPhone('');
    setFirstCustomerVehicle('');
    replyAnim.setValue(0);
    if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    let cancelled = false;
    setLoading(true);
    supabase.from('contacts').select('id,first_name,last_name,vehicle,heat_score,next_step,is_demo').eq('is_demo', true).order('heat_score', { ascending: false }).then(({ data }) => {
      if (cancelled) return;
      setDemos(((data ?? []) as DemoContact[]).filter(c => DEMO_NAMES.has(`${c.first_name} ${c.last_name}`)));
      setLoading(false);
    }, () => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current); };
  }, [open, replyAnim]);

  if (!open) return null;

  const saveIdentity = async (): Promise<boolean> => {
    const name = answers.name.trim();
    const dealership = answers.dealership.trim();
    if (!name || !dealership) { setError('Add your name and store or company so Rex knows who he is working for.'); return false; }
    setSaving(true); setError('');
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
    } catch { setError('Could not save your setup. Try again.'); return false; }
    finally { setSaving(false); }
  };

  const runDemoBlast = () => {
    if (demoBlastSent) return;
    setError(''); setDemoBlastSent(true); setDemoReplyVisible(false); replyAnim.setValue(0);
    if (demoReplyTimerRef.current) clearTimeout(demoReplyTimerRef.current);
    demoReplyTimerRef.current = setTimeout(() => {
      setDemoReplyVisible(true);
      Animated.spring(replyAnim, { toValue: 1, friction: 7, tension: 80, useNativeDriver: false }).start();
    }, 1200);
  };

  const saveFirstCustomer = async () => {
    if (saving) return;
    const full = firstCustomerName.trim(); const phone = firstCustomerPhone.trim();
    if (!full || !phone) { setError('Name and phone are enough to start.'); return; }
    setSaving(true); setError('');
    try {
      const [first, ...rest] = full.split(/\s+/);
      await createContact({ firstName: first, lastName: rest.join(' '), phone, email: '', vehicle: firstCustomerVehicle.trim(), trim: '', budget: '', tradeIn: '', planLabel: '', heatScore: 45, notes: 'Added during PocketRep activation', tags: [] });
      markSoldBookNudgeSeen(); onClose(true);
    } catch (e: any) { setError(e?.message ?? 'Could not add that customer. Try again.'); }
    finally { setSaving(false); }
  };

  const finishWithoutCustomer = () => { markSoldBookNudgeSeen(); onClose(true); };
  const progress = ((step + 1) / 4) * 100;
  const replyContact = demos[0];

  return <View style={styles.root}>
    <View style={styles.top}><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View><Pressable onPress={() => onClose(false)} hitSlop={8}><Text style={styles.skip}>Skip</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.rexRow}><View style={styles.orb} /><Text style={styles.rex}>REX</Text></View>
      {step === 0 ? <><Text style={styles.eyebrow}>01 · MAKE REX YOURS</Text><Text style={styles.title}>Who are we working for?</Text><Text style={styles.body}>Give Rex the basics first. He uses this to coach you and write like someone from your business, not a generic bot.</Text><View style={styles.form}><Text style={styles.label}>YOUR NAME</Text><TextInput value={answers.name} onChangeText={name => setAnswers(a => ({ ...a, name }))} placeholder="Your name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" /><Text style={styles.label}>STORE / COMPANY</Text><TextInput value={answers.dealership} onChangeText={dealership => setAnswers(a => ({ ...a, dealership }))} placeholder="Your store or company" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" /><Text style={styles.label}>INDUSTRY</Text><View style={styles.industryWrap}>{INDUSTRIES.map(industry => <Pressable key={industry} onPress={() => setAnswers(a => ({ ...a, industry }))} style={[styles.industryChip, answers.industry === industry && styles.industryChipSelected]}><Text style={[styles.industryText, answers.industry === industry && styles.industryTextSelected]}>{industry}</Text></Pressable>)}</View><Text style={styles.label}>ROLE · OPTIONAL</Text><TextInput value={answers.title} onChangeText={title => setAnswers(a => ({ ...a, title }))} placeholder="Sales Consultant" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" /><Text style={styles.label}>REX STYLE</Text><View style={styles.tones}>{TONES.map(t => <Pressable key={t.value} onPress={() => setAnswers(a => ({ ...a, tone: t.value }))} style={[styles.tone, answers.tone === t.value && styles.toneSelected]}><Text style={[styles.toneName, answers.tone === t.value && styles.toneNameSelected]}>{t.value}</Text><Text style={styles.toneHint}>{t.hint}</Text></Pressable>)}</View></View></> : null}
      {step === 1 ? <><Text style={styles.eyebrow}>02 · YOUR DEMO BOOK</Text><Text style={styles.title}>See the value before you add anything.</Text><Text style={styles.body}>These three customers are safe demo records. We are going to work them exactly like a real book so you can feel the loop before putting your own customers in.</Text><View style={styles.panel}>{loading ? <ActivityIndicator color={colors.gold} /> : demos.map(d => <DemoRow key={d.id} contact={d} />)}</View><View style={styles.callout}><Text style={styles.calloutTitle}>THE LOOP</Text><Text style={styles.calloutText}>Rex finds the reason → writes each customer differently → you control the action → PocketRep brings the response back into the book.</Text></View></> : null}
      {step === 2 ? <><Text style={styles.eyebrow}>03 · THE A-HA</Text><Text style={styles.title}>Run your first Text Queue.</Text><Text style={styles.body}>Rex wrote a different message for each demo customer. Tap the button and PocketRep will simulate the send — nothing leaves your phone and no real customer is contacted.</Text><View style={styles.queuePanel}>{demos.slice(0, 3).map((d, index) => <View key={d.id} style={styles.messageCard}><View style={styles.messageHead}><Text style={styles.demoName}>{d.first_name} {d.last_name}</Text><Text style={styles.demo}>DEMO</Text></View><Text style={styles.messageText}>{demoMessage(d, index)}</Text></View>)}</View>{demoBlastSent && !demoReplyVisible ? <View style={styles.waitingRow}><ActivityIndicator color={colors.gold} size="small" /><Text style={styles.waitingText}>PocketRep is watching the demo book…</Text></View> : null}{demoReplyVisible && replyContact ? <Animated.View style={[styles.replyToast, { opacity: replyAnim, transform: [{ translateY: replyAnim.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }]}><View style={styles.replyDot} /><View style={{ flex: 1 }}><Text style={styles.replyKicker}>CUSTOMER REPLIED · DEMO</Text><Text style={styles.replyName}>{replyContact.first_name} {replyContact.last_name}</Text><Text style={styles.replyText}>{DEMO_REPLIES[0]}</Text></View></Animated.View> : null}{demoReplyVisible ? <View style={styles.ahaBox}><Text style={styles.ahaTitle}>THAT IS THE POINT.</Text><Text style={styles.ahaText}>PocketRep does not just store names. It helps you create the reason to reach out, keeps the context, and puts the opportunity back in front of you when the customer moves.</Text></View> : null}</> : null}
      {step === 3 ? <><Text style={styles.eyebrow}>04 · MAKE IT YOUR BOOK</Text><Text style={styles.title}>Add one real customer now.</Text><Text style={styles.body}>Do not build the whole CRM yet. Start with one person you actually need to follow up with. Name and phone are enough; vehicle helps Rex make the first message stronger.</Text><View style={styles.form}><Text style={styles.label}>CUSTOMER NAME</Text><TextInput value={firstCustomerName} onChangeText={setFirstCustomerName} placeholder="Customer name" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" /><Text style={styles.label}>PHONE</Text><TextInput value={firstCustomerPhone} onChangeText={setFirstCustomerPhone} placeholder="Phone number" placeholderTextColor={colors.grey} style={styles.input} keyboardType="phone-pad" /><Text style={styles.label}>VEHICLE · OPTIONAL</Text><TextInput value={firstCustomerVehicle} onChangeText={setFirstCustomerVehicle} placeholder="2026 Rogue SV" placeholderTextColor={colors.grey} style={styles.input} /></View><View style={styles.callout}><Text style={styles.calloutTitle}>THEN POCKETREP OPENS UP</Text><Text style={styles.calloutText}>From there: ask Rex for the next move, draft the first text, add Fresh Up if needed, and keep working your real book.</Text></View></> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <View style={styles.bottom}>{step === 0 ? <Pressable onPress={() => { void saveIdentity().then(ok => { if (ok) setStep(1); }); }} disabled={saving} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Next · See my demo book'}</Text></Pressable> : step === 1 ? <Pressable onPress={() => setStep(2)} style={styles.primary}><Text style={styles.primaryText}>Next · Run the demo Text Queue</Text></Pressable> : step === 2 ? demoReplyVisible ? <Pressable onPress={() => setStep(3)} style={styles.primary}><Text style={styles.primaryText}>Now add one of my customers</Text></Pressable> : <Pressable onPress={runDemoBlast} disabled={demoBlastSent || demos.length === 0} style={[styles.primary, (demoBlastSent || demos.length === 0) && styles.disabled]}><Text style={styles.primaryText}>{demoBlastSent ? 'Waiting for the reply…' : `Run demo Text Queue · ${Math.min(demos.length, 3)}`}</Text></Pressable> : <><Pressable onPress={() => { void saveFirstCustomer(); }} disabled={saving} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Adding customer…' : 'Add customer + open PocketRep'}</Text></Pressable><Pressable onPress={finishWithoutCustomer} style={styles.secondary}><Text style={styles.secondaryText}>I’ll add customers later</Text></Pressable></>}</View>
  </View>;
}

function DemoRow({ contact }: { contact: DemoContact }) { const score = contact.heat_score ?? 0; const tier = score >= 75 ? 'HOT' : score >= 50 ? 'WARM' : 'REFERRAL'; return <View style={styles.demoRow}><View style={styles.avatar}><Text style={styles.avatarText}>{contact.first_name[0]}{contact.last_name[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.demoName}>{contact.first_name} {contact.last_name}</Text><Text style={styles.demoVehicle}>{contact.vehicle || 'Sample customer'}</Text></View><View style={styles.demoRight}><Text style={styles.tier}>{tier}</Text><Text style={styles.demo}>DEMO</Text></View></View>; }

const styles = StyleSheet.create({ root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 95 } as any, top: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.ink4, overflow: 'hidden' }, progressFill: { height: 3, backgroundColor: colors.gold }, skip: { color: colors.grey2, fontSize: 12, fontWeight: '600', paddingHorizontal: 8 }, content: { padding: 24, paddingTop: 18, paddingBottom: 26, flexGrow: 1 }, rexRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 20 }, orb: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold }, rex: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 }, eyebrow: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 }, title: { color: colors.white, fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 }, body: { color: colors.grey3, fontSize: 14, lineHeight: 22, marginTop: 12 }, form: { marginTop: 20, gap: 8 }, label: { color: colors.grey2, fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 5 }, input: { minHeight: 48, color: colors.white, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, paddingHorizontal: 13, fontSize: 16 }, industryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, industryChip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 }, industryChipSelected: { borderColor: colors.gold, backgroundColor: colors.goldBg }, industryText: { color: colors.grey2, fontSize: 11, fontWeight: '700' }, industryTextSelected: { color: colors.gold }, tones: { flexDirection: 'row', gap: 8 }, tone: { flex: 1, padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 }, toneSelected: { borderColor: colors.gold, backgroundColor: colors.goldBg }, toneName: { color: colors.grey3, fontSize: 12, fontWeight: '800' }, toneNameSelected: { color: colors.gold }, toneHint: { color: colors.grey, fontSize: 9, lineHeight: 13, marginTop: 3 }, panel: { marginTop: 18, padding: 12, gap: 8, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2 }, demoRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 }, avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder }, avatarText: { color: colors.gold, fontSize: 10, fontWeight: '900' }, demoName: { color: colors.white, fontSize: 12, fontWeight: '700' }, demoVehicle: { color: colors.grey2, fontSize: 10, marginTop: 2 }, demoRight: { alignItems: 'flex-end' }, tier: { color: colors.gold, fontSize: 9, fontWeight: '800' }, demo: { color: colors.grey2, fontSize: 8, fontWeight: '800', letterSpacing: 1 }, callout: { marginTop: 16, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg }, calloutTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, calloutText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 5 }, queuePanel: { marginTop: 18, gap: 8 }, messageCard: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.ink2 }, messageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, messageText: { color: colors.grey3, fontSize: 12, lineHeight: 18 }, waitingRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 }, waitingText: { color: colors.grey3, fontSize: 11, fontWeight: '700' }, replyToast: { marginTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.ink2 }, replyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold, marginTop: 4 }, replyKicker: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, replyName: { color: colors.white, fontSize: 13, fontWeight: '800', marginTop: 4 }, replyText: { color: colors.grey3, fontSize: 12, lineHeight: 18, marginTop: 3 }, ahaBox: { marginTop: 10, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg }, ahaTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, ahaText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 5 }, error: { color: colors.red, fontSize: 12, lineHeight: 18, marginTop: 14 }, bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.ink4 }, primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.gold }, primaryText: { color: colors.ink, fontSize: 14, fontWeight: '900' }, secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: colors.grey3, fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.6 } });