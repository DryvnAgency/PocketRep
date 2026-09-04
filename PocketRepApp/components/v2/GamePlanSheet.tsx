import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label, Pill, HeatStripe } from './atoms';
import { useSequences, type V2Sequence } from '@/lib/v2/useSequences';
import SequenceEditor from './SequenceEditor';
import type { V2Contact } from '@/lib/v2/useContacts';

const CHANNEL_ICON: Record<string, string> = {
  text: '💬',
  call: '📞',
  email: '✉',
};

function SequenceCard({ s, onPress }: { s: V2Sequence; onPress: () => void }) {
  const live = s.enrolledCount > 0;
  return (
    <Pressable onPress={onPress} style={[styles.card, { borderColor: live ? colors.goldBorder : colors.ink4 }]}>
      <HeatStripe color={live ? colors.green : colors.grey} style={styles.stripe} />
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{s.name}</Text>
          <Text style={styles.cardSub}>
            {live
              ? `${s.enrolledCount} enrolled · ${s.steps.length} step${s.steps.length === 1 ? '' : 's'} · tap to edit`
              : `Draft · ${s.steps.length} step${s.steps.length === 1 ? '' : 's'} · tap to edit`}
          </Text>
        </View>
        <Pill color={live ? colors.green : colors.grey2}>
          {live ? '● LIVE' : 'DRAFT'}
        </Pill>
      </View>

      <View style={styles.pipeline}>
        {s.steps.map((step, i) => (
          <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', flex: i === s.steps.length - 1 ? 0 : 1 }}>
            <View style={[
              styles.stepDot,
              { backgroundColor: colors.goldBg, borderColor: colors.gold },
            ]}>
              <Text style={{ fontSize: 11 }}>{CHANNEL_ICON[step.channel] ?? '●'}</Text>
            </View>
            {i < s.steps.length - 1 ? (
              <View style={styles.stepLine} />
            ) : null}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export default function GamePlanSheet({
  open, onClose, contacts, onStartCallQueue, onStartTextQueue,
}: {
  open: boolean;
  onClose: () => void;
  contacts: V2Contact[];
  onStartCallQueue: (contacts: V2Contact[]) => void;
  onStartTextQueue: (contacts: V2Contact[]) => void;
}) {
  const [editorTarget, setEditorTarget] = useState<V2Sequence | null>(null);
  const [refetch, setRefetch] = useState(0);
  const { sequences, error } = useSequences(open ? refetch + 1 : 0);
  const workBook = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const score = (c: V2Contact) => {
      let s = 0;
      if (c.nextFollowupDate && c.nextFollowupDate <= today) s += 120;
      if (c.tier === 'hot') s += 55;
      else if (c.tier === 'warm') s += 35;
      if (!c.isPastCustomer && c.days >= 14) s += 45;
      if (c.isPastCustomer && c.days >= 30) s += 40;
      if (c.days >= 90) s += 50;
      if (c.leaseEndDate) {
        const remaining = Math.ceil((new Date(c.leaseEndDate + 'T12:00:00').getTime() - Date.now()) / 86_400_000);
        if (remaining >= 0 && remaining <= 180) s += 60;
      }
      return s;
    };
    const candidates = contacts
      .filter(c => !c.doNotContact && !!c.phone)
      .map(c => ({ c, score: score(c) }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(row => row.c);
    const call = candidates
      .filter(c => c.tier === 'hot' || c.tier === 'warm' || (!!c.nextFollowupDate && c.nextFollowupDate <= today))
      .slice(0, 25);
    const text = candidates.slice(0, 25);
    return { call, text };
  }, [contacts]);
  if (!open) return null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>REX · GAME PLAN</Label>
          <Text style={styles.topTitle}>Work My Book</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.workHero}>
          <Text style={styles.workEyebrow}>TODAY'S EXECUTION</Text>
          <Text style={styles.workTitle}>Rex sorted the people worth touching.</Text>
          <Text style={styles.workBody}>Due follow-ups, stalled opportunities, long-dormant customers, sold ownership touches, and lease timing rise to the top.</Text>
          <View style={styles.workActions}>
            <Pressable
              onPress={() => onStartCallQueue(workBook.call)}
              disabled={workBook.call.length === 0}
              style={[styles.workCard, workBook.call.length === 0 && { opacity: 0.45 }]}
            >
              <Text style={styles.workIcon}>📞</Text>
              <Text style={styles.workCardTitle}>CALL QUEUE</Text>
              <Text style={styles.workCardCount}>{workBook.call.length} ready</Text>
              <Text style={styles.workCardHint}>call → outcome → next</Text>
            </Pressable>
            <Pressable
              onPress={() => onStartTextQueue(workBook.text)}
              disabled={workBook.text.length === 0}
              style={[styles.workCard, workBook.text.length === 0 && { opacity: 0.45 }]}
            >
              <Text style={styles.workIcon}>💬</Text>
              <Text style={styles.workCardTitle}>TEXT QUEUE</Text>
              <Text style={styles.workCardCount}>{workBook.text.length} ready</Text>
              <Text style={styles.workCardHint}>personalized → review → send</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionDivider}>
          <Text style={styles.sectionDividerText}>SEQUENCES</Text>
        </View>

        {error ? (
          <Text style={styles.error}>Couldn't load: {error}</Text>
        ) : !sequences ? (
          <View style={styles.center}>
            <RadarLoader size={32} />
          </View>
        ) : sequences.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No sequences yet</Text>
            <Text style={styles.emptyHint}>Sequences run automatic text/call/email cadences for any contact you enroll.</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.intro}>
              Keep long-term follow-up organized after today's work is handled. Enroll from any contact card.
            </Text>
            {sequences.map(s => (
              <SequenceCard
                key={s.id}
                s={s}
                onPress={() => setEditorTarget(s)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <SequenceEditor
        open={!!editorTarget}
        sequence={editorTarget}
        onClose={() => setEditorTarget(null)}
        onSaved={() => setRefetch(k => k + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.ink,
    zIndex: 70,
  } as any,
  topBar: {
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
    backgroundColor: colors.ink2,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: colors.gold, fontSize: 18, fontWeight: '700' },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: -0.2, marginTop: 2 },

  body: { paddingBottom: Platform.OS === 'web' ? ('max(30px, env(safe-area-inset-bottom))' as any) : 30 },
  workHero: {
    marginHorizontal: 14, marginTop: 14, padding: 16, borderRadius: radius.lg,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
  },
  workEyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  workTitle: { color: colors.white, fontSize: 18, fontWeight: '800', marginTop: 5, letterSpacing: -0.3 },
  workBody: { color: colors.grey3, fontSize: 12, lineHeight: 17, marginTop: 6 },
  workActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  workCard: {
    flex: 1, minHeight: 128, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.ink4,
  },
  workIcon: { fontSize: 20 },
  workCardTitle: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, marginTop: 8 },
  workCardCount: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 4 },
  workCardHint: { color: colors.grey2, fontSize: 10, lineHeight: 14, marginTop: 4 },
  sectionDivider: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  sectionDividerText: { color: colors.grey2, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  center: { padding: 40, alignItems: 'center' },
  error: { color: colors.red, padding: 16, fontSize: 13 },
  empty: {
    marginHorizontal: 14,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  emptyHint: { fontSize: 12, color: colors.grey2, marginTop: 6, textAlign: 'center', lineHeight: 17 },
  intro: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
    fontSize: 12, color: colors.grey2, lineHeight: 17,
  },

  card: {
    position: 'relative',
    marginHorizontal: 14, marginVertical: 6,
    paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  stripe: {
    borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
  } as any,
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardName: { fontSize: 14, fontWeight: '700', color: colors.white, letterSpacing: -0.2 },
  cardSub: { fontSize: 11, color: colors.grey2, marginTop: 3 },

  pipeline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLine: { flex: 1, height: 1.5, backgroundColor: colors.gold, marginHorizontal: 2 },
});
