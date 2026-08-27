import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, LoadingState, ErrorState } from './atoms';
import { fetchOverviewStats, fetchStripeStats, cents, compact } from '@/lib/v2/admin/adminData';
import type { OverviewStats, StripeStats } from '@/lib/v2/admin/adminTypes';

export default function OverviewTab() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [stripe, setStripe] = useState<StripeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      fetchOverviewStats().then(setStats),
      fetchStripeStats().then(setStripe),
    ]).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !stats) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  return (
    <View style={st.content}>
      <SectionHeader label="CUSTOMERS" />
      <KpiRow>
        <KpiCard label="Total customers" value={String(stats.totalUsers)} />
        <KpiCard label="Active" value={String(stats.activeSubscriptions)} accent={colors.green} />
        <KpiCard label="Trialing" value={String(stats.trialingUsers)} accent={colors.gold} />
      </KpiRow>

      <SectionHeader label="REVENUE" />
      <KpiRow>
        <KpiCard label="MRR" value={stripe ? cents(stripe.mrr) : '…'} />
        <KpiCard label="Revenue MTD" value={stripe ? cents(stripe.revenueThisMonth) : '…'} />
        <KpiCard label="Past due" value={stripe ? String(stripe.pastDueSubscriptions) : '…'} accent={stripe?.pastDueSubscriptions ? colors.red : undefined} />
      </KpiRow>
      {stripe?.error ? <Text style={st.hint}>Stripe: {stripe.error}</Text> : null}

      <SectionHeader label="OPERATIONS" />
      <KpiRow>
        <KpiCard label="AI cost (all time)" value={cents(stats.totalAiCost)} />
        <KpiCard label="Open tickets" value={String(stats.openTickets)} accent={stats.openTickets > 0 ? colors.orange : undefined} />
        <KpiCard label="Referrals" value={String(stats.totalReferrals)} sub={`${stats.rewardedReferrals} rewarded`} />
      </KpiRow>

      {stripe ? (
        <>
          <SectionHeader label="AI GROSS MARGIN" />
          <View style={st.marginCard}>
            <View style={st.marginRow}>
              <Text style={st.marginLabel}>Revenue MTD</Text>
              <Text style={st.marginValue}>{cents(stripe.revenueThisMonth)}</Text>
            </View>
            <View style={st.marginRow}>
              <Text style={st.marginLabel}>AI cost MTD</Text>
              <Text style={[st.marginValue, { color: colors.red }]}>−{cents(stats.totalAiCost)}</Text>
            </View>
            <View style={[st.marginRow, st.marginTotal]}>
              <Text style={st.marginLabel}>Contribution</Text>
              <Text style={[st.marginValue, { color: colors.green }]}>
                {cents(stripe.revenueThisMonth - stats.totalAiCost)}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  hint: { fontSize: 11, color: colors.grey, marginTop: 6, fontStyle: 'italic' },
  marginCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 14,
  },
  marginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  marginTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
    marginTop: 4,
    paddingTop: 10,
  },
  marginLabel: { fontSize: 13, color: colors.grey2 },
  marginValue: { fontSize: 14, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
});
