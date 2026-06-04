import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import RadarLoader from './RadarLoader';
import { colors, radius } from '@/constants/theme';
import { Label, Pill, HeatStripe } from './atoms';
import { useSequences, type V2Sequence } from '@/lib/v2/useSequences';
import SequenceEditor from './SequenceEditor';

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
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [editorTarget, setEditorTarget] = useState<V2Sequence | null>(null);
  const [refetch, setRefetch] = useState(0);
  const { sequences, error } = useSequences(open ? refetch + 1 : 0);
  if (!open) return null;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Label color={colors.gold}>GAME PLAN</Label>
          <Text style={styles.topTitle}>Sequences & templates</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
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
              Multi-step cadences that text, call, or email contacts on your schedule. Enroll from any contact card.
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

  body: { paddingBottom: 30 },
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
