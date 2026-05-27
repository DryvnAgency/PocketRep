import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { Label, Pill } from './atoms';
import type { PayPlan } from '@/lib/v2/payPlan';

export default function PayPlanSummary({
  plan, onEdit,
}: {
  plan: PayPlan;
  onEdit: () => void;
}) {
  return (
    <Pressable onPress={onEdit} style={styles.card}>
      <View style={styles.head}>
        <Label color={colors.gold}>YOUR PAY PLAN</Label>
        <View style={{ flex: 1 }} />
        <Text style={styles.edit}>EDIT ›</Text>
      </View>

      <View style={styles.stats}>
        <Stat label="FRONT" value={`${plan.frontPct}`} suffix="%" />
        <Stat label="BACK" value={`${plan.backPct}`} suffix="%" />
        <Stat label="MINI" value={`$${plan.flatMini}`} />
      </View>

      <View style={styles.pills}>
        <Pill color={colors.gold}>+${plan.manuBonus}/UNIT SPIFFS</Pill>
        <Pill color={colors.gold}>+${plan.csiBonus}/UNIT BONUS</Pill>
        <Pill color={colors.gold}>{plan.unitBonuses.length} TIER{plan.unitBonuses.length === 1 ? '' : 'S'}</Pill>
      </View>
    </Pressable>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  edit: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },

  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 0.8 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.gold2, letterSpacing: -0.4, marginTop: 4 },
  statSuffix: { fontSize: 12, opacity: 0.6 },

  pills: {
    paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.ink4,
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
});
