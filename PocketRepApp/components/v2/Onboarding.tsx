import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

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

const DEMO_NAMES = new Set(['Marcus Holloway', 'Sarah Thompson', 'Mike Rodriguez']);

export default function Onboarding({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [demos, setDemos] = useState<DemoContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [practiceBlastDone, setPracticeBlastDone] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep(0);
    setPracticeBlastDone(false);
    setSelectedDemo(null);
    setLoading(true);

    supabase
      .from('contacts')
      .select('id, first_name, last_name, vehicle, heat_score, next_step, plan_label, is_demo')
      .eq('is_demo', true)
      .order('heat_score', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = ((data ?? []) as DemoContact[]).filter(c =>
          DEMO_NAMES.has(`${c.first_name} ${c.last_name}`),
        );
        setDemos(rows);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [open]);

  const current = demos.find(d => d.id === selectedDemo) ?? demos[0];
  const hot = useMemo(() => demos.filter(d => (d.heat_score ?? 0) >= 75), [demos]);

  if (!open) return null;

  const finish = () => {
    onClose();
    setTimeout(() => setStep(0), 200);
  };

  const next = () => {
    if (step >= 5) {
      finish();
      return;
    }
    setStep(s => s + 1);
  };

  const practiceBlast = () => {
    // Deliberately does NOT create messages or call a texting provider.
    // The three contacts are onboarding-only demo records.
    setPracticeBlastDone(true);
  };

  const removeDemosNow = async () => {
    await supabase.from('contacts').delete().eq('is_demo', true);
    setDemos([]);
    finish();
  };

  const stepData = [
    {
      n: '01', label: 'WELCOME', title: 'Let\'s find your next deal.',
      body: 'PocketRep has already placed 3 sample customers in your book so you can learn the workflow by actually using it — not by reading a manual.',
    },
    {
      n: '02', label: 'HEAT SHEET', title: 'Start here every morning.',
      body: 'The Heat Sheet answers one question: who should I talk to first? Your three sample customers are intentionally different so you can see HOT, WARM, and referral opportunities.',
    },
    {
      n: '03', label: 'WORK A CUSTOMER', title: 'Open the customer. Know what to say.',
      body: 'Pick a customer, see the context, then use Rex to draft the next message. This is the loop you will repeat with your real book.',
    },
    {
      n: '04', label: 'PRACTICE BLAST', title: 'Work your sold customers in batches.',
      body: 'When you import your real book, start with last month\'s sold customers. Send a reviewed follow-up blast, then put those customers into a sequence so PocketRep keeps working them.',
    },
    {
      n: '05', label: 'BUILD THE BOOK', title: 'Then work backward.',
      body: 'After last month, work 60 days, 90 days, 3–6 months, and 6–12 months. You are building a repeatable customer-reach habit instead of chasing a new lead every day.',
    },
    {
      n: '06', label: 'DAILY RHYTHM', title: 'PocketRep checks in with you.',
      body: 'Each day, start with your Heat Sheet. Work the list, log what happened, and let sequences handle the next touch. At the end of the day, Rex can help you see what is left.',
    },
  ][step];

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progress}>
          {[0, 1, 2, 3, 4, 5].map(k => (
            <View key={k} style={[styles.progressBar, { backgroundColor: k <= step ? colors.gold : colors.ink4 }]} />
          ))}
        </View>
        <Pressable onPress={finish} hitSlop={8}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bigN}>{stepData.n}</Text>
        <Text style={styles.label}>{stepData.label}</Text>
        <Text style={styles.title}>{stepData.title}</Text>
        <Text style={styles.body}>{stepData.body}</Text>

        {loading ? (
          <View style={styles.demoPanel}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.muted}>Loading your sample customers…</Text>
          </View>
        ) : null}

        {step === 0 && !loading ? (
          <View style={styles.demoPanel}>
            <View style={styles.demoHeader}>
              <Text style={styles.panelTitle}>YOUR SAMPLE BOOK</Text>
              <Text style={styles.demoBadge}>DEMO</Text>
            </View>
            {demos.map(d => (
              <DemoRow key={d.id} contact={d} onPress={() => { setSelectedDemo(d.id); setStep(2); }} />
            ))}
            <Text style={styles.note}>These are isolated to your account and are never shared with another rep.</Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.demoPanel}>
            <Text style={styles.panelTitle}>HEAT SHEET EXAMPLE</Text>
            {demos.map(d => (
              <DemoRow key={d.id} contact={d} onPress={() => setSelectedDemo(d.id)} />
            ))}
            <View style={styles.tip}>
              <Text style={styles.tipText}>🔥 HOT gets worked first. WARM gets nurtured. Referral opportunities stay visible.</Text>
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.demoPanel}>
            <Text style={styles.panelTitle}>PRACTICE CUSTOMER</Text>
            {current ? (
              <>
                <DemoRow contact={current} onPress={() => undefined} />
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>NEXT STEP</Text>
                  <Text style={styles.detailText}>{current.next_step || 'Ask Rex what to do next.'}</Text>
                </View>
                <View style={styles.actionRow}>
                  <View style={styles.action}><Text style={styles.actionText}>CALL</Text></View>
                  <View style={styles.action}><Text style={styles.actionText}>TEXT</Text></View>
                  <View style={styles.action}><Text style={styles.actionText}>REX</Text></View>
                </View>
                <Text style={styles.note}>Practice here. These customers are marked DEMO and must never receive a real message.</Text>
              </>
            ) : (
              <Text style={styles.muted}>Your sample customers will appear here.</Text>
            )}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.demoPanel}>
            <View style={styles.blastHeader}>
              <View>
                <Text style={styles.panelTitle}>LAST 30 DAYS</Text>
                <Text style={styles.muted}>{demos.length} sample sold customers</Text>
              </View>
              <Text style={styles.count}>{demos.length}</Text>
            </View>
            {!practiceBlastDone ? (
              <Pressable style={styles.primarySmall} onPress={practiceBlast}>
                <Text style={styles.primarySmallText}>PRACTICE THE BLAST</Text>
              </Pressable>
            ) : (
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>✓ Blast workflow complete</Text>
                <Text style={styles.successText}>In the real book, this is where you review the messages, send the blast, and enroll those customers into a follow-up sequence.</Text>
              </View>
            )}
            <View style={styles.sequencePreview}>
              <Text style={styles.panelTitle}>THEN POCKETREP KEEPS WORKING</Text>
              <Text style={styles.sequenceText}>Today → 3 days → 7 days → 14 days → 30 days</Text>
            </View>
          </View>
        ) : null}

        {step === 4 ? (
          <View style={styles.demoPanel}>
            {['Last month', '60–90 days', '3–6 months', '6–12 months'].map((label, i) => (
              <View key={label} style={styles.monthRow}>
                <View style={[styles.monthDot, i === 0 && { backgroundColor: colors.gold }]} />
                <Text style={styles.monthText}>{label}</Text>
                <Text style={styles.monthStatus}>{i === 0 ? 'START HERE' : 'NEXT'}</Text>
              </View>
            ))}
            <Text style={styles.note}>The goal is not one giant blast. It is turning your sold book into a repeatable source of conversations.</Text>
          </View>
        ) : null}

        {step === 5 ? (
          <View style={styles.demoPanel}>
            <View style={styles.dailyRow}><Text style={styles.dailyTime}>MORNING</Text><Text style={styles.dailyText}>Open Heat Sheet and work HOT first.</Text></View>
            <View style={styles.dailyRow}><Text style={styles.dailyTime}>MIDDAY</Text><Text style={styles.dailyText}>Check replies and advance conversations.</Text></View>
            <View style={styles.dailyRow}><Text style={styles.dailyTime}>END DAY</Text><Text style={styles.dailyText}>Log activity and let Rex show you what is left.</Text></View>
            <View style={styles.successBox}>
              <Text style={styles.successTitle}>Your sample customers are temporary.</Text>
              <Text style={styles.successText}>Import your real customers. As soon as the first real customer is added, PocketRep automatically removes the 3 sample customers.</Text>
            </View>
            {demos.length > 0 ? (
              <Pressable style={styles.secondaryBtn} onPress={removeDemosNow}>
                <Text style={styles.secondaryBtnText}>REMOVE SAMPLE CUSTOMERS NOW</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bottom}>
        <Pressable onPress={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={[styles.backBtn, step === 0 && { opacity: 0.35 }]}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Pressable onPress={next} style={styles.nextBtn}>
          <Text style={styles.nextBtnText}>{step === 5 ? "Let's go" : `Next · ${step + 2}/6`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DemoRow({ contact, onPress }: { contact: DemoContact; onPress: () => void }) {
  const score = contact.heat_score ?? 0;
  const tier = score >= 75 ? 'HOT' : score >= 50 ? 'WARM' : 'REFERRAL';
  return (
    <Pressable onPress={onPress} style={styles.demoRow}>
      <View style={[styles.heatStripe, { backgroundColor: score >= 75 ? colors.red : score >= 50 ? colors.orange : colors.gold }]} />
      <View style={styles.avatar}><Text style={styles.avatarText}>{contact.first_name[0]}{contact.last_name[0]}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.demoName}>{contact.first_name} {contact.last_name}</Text>
        <Text style={styles.demoVehicle}>{contact.vehicle || 'Sample customer'}</Text>
      </View>
      <View style={styles.demoRight}>
        <Text style={styles.demoTier}>{tier}</Text>
        <Text style={styles.demoLabel}>DEMO</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.ink, zIndex: 95 } as any,
  top: { paddingTop: 24, paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  skip: { fontSize: 12, fontWeight: '600', color: colors.grey2, paddingHorizontal: 8 },
  content: { padding: 24, paddingTop: 8, paddingBottom: 28 },
  bigN: { fontSize: 60, fontWeight: '900', color: colors.gold, letterSpacing: -2, lineHeight: 60, opacity: 0.85 },
  label: { fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 1.4, marginTop: 8 },
  title: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 10, lineHeight: 34, letterSpacing: -0.8 },
  body: { fontSize: 14, color: colors.grey3, marginTop: 14, lineHeight: 22 },
  demoPanel: { marginTop: 22, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: radius.xl, padding: 14, gap: 9 },
  demoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  panelTitle: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 1.2 },
  demoBadge: { fontSize: 9, fontWeight: '800', color: colors.ink, backgroundColor: colors.gold, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  demoRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, borderRadius: 10, position: 'relative', overflow: 'hidden' },
  heatStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.gold, fontSize: 10, fontWeight: '800' },
  demoName: { color: colors.white, fontSize: 12, fontWeight: '700' },
  demoVehicle: { color: colors.grey2, fontSize: 10, marginTop: 2 },
  demoRight: { alignItems: 'flex-end', gap: 2 },
  demoTier: { color: colors.gold, fontSize: 9, fontWeight: '800' },
  demoLabel: { color: colors.grey2, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
  note: { color: colors.grey2, fontSize: 10, lineHeight: 16, marginTop: 3 },
  tip: { marginTop: 5, padding: 11, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 10 },
  tipText: { color: colors.gold, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  detailBox: { padding: 11, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.ink4 },
  detailLabel: { color: colors.grey2, fontSize: 8, fontWeight: '800', letterSpacing: 1.1 },
  detailText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center' },
  actionText: { color: colors.gold, fontSize: 9, fontWeight: '800' },
  blastHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: colors.gold, fontSize: 30, fontWeight: '900' },
  primarySmall: { height: 46, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primarySmallText: { color: colors.ink, fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  successBox: { padding: 12, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 10, marginTop: 4 },
  successTitle: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  successText: { color: colors.grey3, fontSize: 11, lineHeight: 17, marginTop: 4 },
  sequencePreview: { paddingTop: 7, borderTopWidth: 1, borderTopColor: colors.ink4, marginTop: 3 },
  sequenceText: { color: colors.white, fontSize: 12, fontWeight: '700', marginTop: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  monthDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.ink4 },
  monthText: { flex: 1, color: colors.white, fontSize: 12, fontWeight: '700' },
  monthStatus: { color: colors.grey2, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  dailyRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  dailyTime: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  dailyText: { color: colors.white, fontSize: 12, lineHeight: 17, marginTop: 3 },
  muted: { color: colors.grey2, fontSize: 11, marginTop: 3 },
  secondaryBtn: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.ink4, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  secondaryBtnText: { color: colors.grey3, fontSize: 10, fontWeight: '800' },
  bottom: { paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 30, backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: colors.ink4, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: colors.gold, fontSize: 18 },
  nextBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: colors.ink, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
});
