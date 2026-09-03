import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { setRepSetting } from '@/lib/v2/repSettings';

type DemoContact = {
  id: string;
  first_name: string;
  last_name: string;
  vehicle: string | null;
  heat_score: number | null;
  next_step: string | null;
  is_demo: boolean;
};

type Answers = { name: string; dealership: string; title: string; tone: string };
const EMPTY: Answers = { name: '', dealership: '', title: '', tone: 'Sharp' };
const DEMO_NAMES = new Set(['Marcus Holloway', 'Sarah Thompson', 'Mike Rodriguez']);
const TONES = [
  { value: 'Steady', hint: 'calm and trusted' },
  { value: 'Sharp', hint: 'direct and confident' },
  { value: 'Fire', hint: 'high energy closer' },
];

export default function RexOnboarding({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: (completed: boolean) => void;
  onImport?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [demos, setDemos] = useState<DemoContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setAnswers(EMPTY);
    setError('');
    let cancelled = false;
    setLoading(true);
    supabase
      .from('contacts')
      .select('id,first_name,last_name,vehicle,heat_score,next_step,is_demo')
      .eq('is_demo', true)
      .order('heat_score', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setDemos(((data ?? []) as DemoContact[]).filter(c => DEMO_NAMES.has(`${c.first_name} ${c.last_name}`)));
        setLoading(false);
      }, () => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const saveIdentity = async (): Promise<boolean> => {
    const name = answers.name.trim();
    const dealership = answers.dealership.trim();
    if (!name || !dealership) {
      setError('Add your name and dealership so Rex knows who he is working for.');
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

  const nextFromIdentity = async () => {
    if (await saveIdentity()) setStep(1);
  };

  const finish = () => onClose(true);
  const importBook = () => {
    if (onImport) onImport();
    else finish();
  };

  const progress = ((step + 1) / 3) * 100;
  const current = demos[0];

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Pressable onPress={() => onClose(false)} hitSlop={8}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.rexRow}><View style={styles.orb} /><Text style={styles.rex}>REX</Text></View>

        {step === 0 ? (
          <>
            <Text style={styles.eyebrow}>01 · MAKE REX YOURS</Text>
            <Text style={styles.title}>Who are we working for?</Text>
            <Text style={styles.body}>Give Rex the basics first. He uses this to coach you and write like your dealership's salesperson, not a generic bot.</Text>
            <View style={styles.form}>
              <Text style={styles.label}>YOUR NAME</Text>
              <TextInput value={answers.name} onChangeText={name => setAnswers(a => ({ ...a, name }))} placeholder="Eddie Ponce" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>DEALERSHIP</Text>
              <TextInput value={answers.dealership} onChangeText={dealership => setAnswers(a => ({ ...a, dealership }))} placeholder="Nissan of Omaha" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>ROLE · OPTIONAL</Text>
              <TextInput value={answers.title} onChangeText={title => setAnswers(a => ({ ...a, title }))} placeholder="Sales Consultant" placeholderTextColor={colors.grey} style={styles.input} autoCapitalize="words" />
              <Text style={styles.label}>REX STYLE</Text>
              <View style={styles.tones}>
                {TONES.map(t => (
                  <Pressable key={t.value} onPress={() => setAnswers(a => ({ ...a, tone: t.value }))} style={[styles.tone, answers.tone === t.value && styles.toneSelected]}>
                    <Text style={[styles.toneName, answers.tone === t.value && styles.toneNameSelected]}>{t.value}</Text>
                    <Text style={styles.toneHint}>{t.hint}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.eyebrow}>02 · SEE THE LOOP</Text>
            <Text style={styles.title}>Your sample book is practice. Nothing fake follows you.</Text>
            <Text style={styles.body}>These 3 customers belong only to your account, are marked DEMO everywhere, and can never receive a real message. The moment you add or import your first real customer, they disappear.</Text>
            <View style={styles.panel}>
              {loading ? <ActivityIndicator color={colors.gold} /> : demos.map(d => <DemoRow key={d.id} contact={d} />)}
            </View>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>THE POCKETREP LOOP</Text>
              <Text style={styles.calloutText}>Find who matters → open the customer → ask Rex for the next move → take the action → let PocketRep keep the follow-up alive.</Text>
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.eyebrow}>03 · WORK YOUR BOOK</Text>
            <Text style={styles.title}>Your next deal may already be in your phone.</Text>
            <Text style={styles.body}>Import your real contacts now, start with recent sold customers, open one person, and ask Rex what to do next. That's the fastest way to feel PocketRep working.</Text>
            {current ? (
              <View style={styles.panel}>
                <DemoRow contact={current} />
                <View style={styles.nextBox}>
                  <Text style={styles.nextLabel}>EXAMPLE NEXT MOVE</Text>
                  <Text style={styles.nextText}>{current.next_step || 'Open the customer and ask Rex for the next move.'}</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.small}>Not ready to import? Go to the Heat Sheet and practice on the DEMO customers first.</Text>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.bottom}>
        {step === 0 ? (
          <Pressable onPress={() => { void nextFromIdentity(); }} disabled={saving} style={[styles.primary, saving && styles.disabled]}>
            <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Next · See PocketRep'}</Text>
          </Pressable>
        ) : step === 1 ? (
          <Pressable onPress={() => setStep(2)} style={styles.primary}>
            <Text style={styles.primaryText}>Next · Work my book</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={importBook} style={styles.primary}>
              <Text style={styles.primaryText}>Import my real book</Text>
            </Pressable>
            <Pressable onPress={finish} style={styles.secondary}>
              <Text style={styles.secondaryText}>Practice on the Heat Sheet first</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

function DemoRow({ contact }: { contact: DemoContact }) {
  const score = contact.heat_score ?? 0;
  const tier = score >= 75 ? 'HOT' : score >= 50 ? 'WARM' : 'REFERRAL';
  return (
    <View style={styles.demoRow}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{contact.first_name[0]}{contact.last_name[0]}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.demoName}>{contact.first_name} {contact.last_name}</Text><Text style={styles.demoVehicle}>{contact.vehicle || 'Sample customer'}</Text></View>
      <View style={styles.demoRight}><Text style={styles.tier}>{tier}</Text><Text style={styles.demo}>DEMO</Text></View>
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
  input: { minHeight: 48, color: colors.white, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md, paddingHorizontal: 13, fontSize: 14 },
  tones: { flexDirection: 'row', gap: 8 },
  tone: { flex: 1, padding: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  toneSelected: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  toneName: { color: colors.grey3, fontSize: 12, fontWeight: '800' },
  toneNameSelected: { color: colors.gold },
  toneHint: { color: colors.grey, fontSize: 9, lineHeight: 13, marginTop: 3 },
  panel: { marginTop: 18, padding: 12, gap: 8, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.ink2 },
  demoRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  avatarText: { color: colors.gold, fontSize: 10, fontWeight: '900' },
  demoName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  demoVehicle: { color: colors.grey2, fontSize: 10, marginTop: 2 },
  demoRight: { alignItems: 'flex-end' },
  tier: { color: colors.gold, fontSize: 9, fontWeight: '800' },
  demo: { color: colors.grey2, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  callout: { marginTop: 16, padding: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  calloutTitle: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  calloutText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 5 },
  nextBox: { padding: 10, borderRadius: radius.md, backgroundColor: colors.goldBg },
  nextLabel: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  nextText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 4 },
  small: { color: colors.grey2, fontSize: 11, lineHeight: 17, marginTop: 14 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, marginTop: 14 },
  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, gap: 8, borderTopWidth: 1, borderTopColor: colors.ink4 },
  primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.gold },
  primaryText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.grey3, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
