// Owner Control Center — Growth Calculator
// Conservative/Base/Aggressive 12-month projections, derived entirely from
// the account's own current signup pace, referral rate, and churn — never
// hardcoded assumptions.

import { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { SectionHeader } from './atoms';
import { deriveGrowthScenarios, computeGrowthProjection, compact } from '@/lib/v2/admin/adminData';
import type { OverviewStats, StripeStats } from '@/lib/v2/admin/adminTypes';

const PROJECTION_MONTHS = 12;
const SCENARIO_COLOR: Record<string, string> = {
  conservative: colors.grey2,
  base: colors.gold,
  aggressive: colors.green,
};

export default function GrowthCalculator({ overview, stripe }: { overview: OverviewStats; stripe: StripeStats }) {
  const [expanded, setExpanded] = useState(false);
  const scenarios = useMemo(() => deriveGrowthScenarios(overview, stripe), [overview, stripe]);
  const projections = useMemo(
    () => scenarios.map(s => ({
      scenario: s,
      values: computeGrowthProjection(overview.activeSubscriptions, s, PROJECTION_MONTHS),
    })),
    [scenarios, overview.activeSubscriptions],
  );
  const maxValue = Math.max(1, ...projections.flatMap(p => p.values));

  return (
    <View>
      <SectionHeader
        label="GROWTH CALCULATOR"
        action={expanded ? 'Collapse' : 'Expand'}
        onAction={() => setExpanded(v => !v)}
      />
      {!expanded ? (
        <Text style={st.collapsedHint}>
          12-month projection from your current signup pace, referral rate, and churn.
        </Text>
      ) : (
        <View style={st.wrap}>
          <View style={st.scenarioRow}>
            {projections.map(({ scenario, values }) => (
              <View key={scenario.key} style={st.scenarioCard}>
                <Text style={[st.scenarioLabel, { color: SCENARIO_COLOR[scenario.key] }]}>{scenario.label}</Text>
                <Text style={st.scenarioBig}>{compact(values[values.length - 1])}</Text>
                <Text style={st.scenarioSub}>paying reps in {PROJECTION_MONTHS}mo</Text>
                <View style={st.assumptionRow}>
                  <Text style={st.assumption}>Growth {(scenario.monthlyGrowthRate * 100).toFixed(1)}%/mo</Text>
                  <Text style={st.assumption}>Referral {(scenario.referralRate * 100).toFixed(1)}%/mo</Text>
                  <Text style={st.assumption}>Churn {(scenario.churnRate * 100).toFixed(1)}%/mo</Text>
                </View>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chartScroll}>
            <View style={st.chart}>
              {projections.map(({ scenario, values }) => (
                <View key={scenario.key} style={st.chartCol}>
                  {values.map((v, i) => (
                    <View
                      key={i}
                      style={[
                        st.chartBar,
                        { height: Math.max(2, (v / maxValue) * 100), backgroundColor: SCENARIO_COLOR[scenario.key] },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={st.chartHint}>Each column: months 1–{PROJECTION_MONTHS}, left to right.</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  collapsedHint: { fontSize: 11, color: colors.grey, fontStyle: 'italic', marginBottom: 4 },
  wrap: { gap: 12 },
  scenarioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scenarioCard: {
    flex: 1,
    minWidth: 150,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  scenarioLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  scenarioBig: { fontSize: 24, fontWeight: '900', color: colors.white, marginTop: 6, fontVariant: ['tabular-nums'] },
  scenarioSub: { fontSize: 10, color: colors.grey2, marginTop: 2 },
  assumptionRow: { marginTop: 10, gap: 2 },
  assumption: { fontSize: 10, color: colors.grey },
  chartScroll: { flexGrow: 0 },
  chart: {
    flexDirection: 'row',
    gap: 16,
    height: 110,
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  chartCol: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chartBar: { width: 6, borderRadius: 2 },
  chartHint: { fontSize: 10, color: colors.grey, marginTop: 4 },
});
