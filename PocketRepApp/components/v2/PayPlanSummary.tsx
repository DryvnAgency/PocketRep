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
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel="Edit your pay plan"
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.head}>
        <View>
          <Label color={colors.gold}>YOUR PAY PLAN</Label>
          <Text style={styles.subhead}>Commission setup</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.editPill}>
          <Text style={styles.edit}>EDIT</Text>
          <Text style={styles.editArrow}>›</Text>
        </View>
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
    minHeight: 44,
    marginHorizontal: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.992 }],
    backgroundColor: colors.goldBg,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  subhead: { marginTop: 3, fontSize: 11, fontWeight: '600', color: colors.grey2 },
  editPill: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    backgroundColor: colors.goldBg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  edit: { fontSize: 10, fontWeight: '800', color: colors.gold, letterSpacing: 0.8 },
  editArrow: { fontSize: 15, fontWeight: '700', color: colors.gold, marginTop: -1 },

  stats: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.ink3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink4,
    justifyContent: 'center',
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.grey2, letterSpacing: 0.8 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.gold2, letterSpacing: -0.4, marginTop: 4 },
  statSuffix: { fontSize: 12, opacity: 0.6 },

  pills: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
