import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label } from './atoms';
import type { BookSummaryPayload } from '@/lib/v2/rexActions';

export default function BookSummaryCard({ payload }: { payload: BookSummaryPayload }) {
  const t = payload.by_tier ?? { hot: 0, warm: 0, watch: 0, cold: 0, dead: 0 };
  return (
    <View style={styles.card}>
      <Label color={colors.gold}>BOOK SNAPSHOT</Label>
      <View style={styles.headline}>
        <Text style={styles.bigNum}>{payload.total ?? 0}</Text>
        <Text style={styles.bigUnit}>contacts</Text>
      </View>
      <View style={styles.grid}>
        <Stat label="HOT" value={t.hot ?? 0} color={colors.red} />
        <Stat label="WARM" value={t.warm ?? 0} color={colors.orange} />
        <Stat label="WATCH" value={t.watch ?? 0} color={colors.grey3} />
        <Stat label="STALLED" value={payload.stalled ?? 0} color={colors.gold} />
      </View>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 10,
  },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  bigNum: { fontSize: 32, fontWeight: '900', color: colors.white, letterSpacing: -0.8 },
  bigUnit: { fontSize: 13, color: colors.grey2, fontWeight: '600' },
  grid: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.ink2,
    borderWidth: 1, borderColor: colors.ink4,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 0.8, marginTop: 2 },
});
