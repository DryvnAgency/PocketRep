import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, LoadingState, ErrorState, MilestoneBar, AlertsList } from './atoms';
import {
  fetchOverviewStats, fetchStripeStats, fetchReferralEconomics, fetchAiDetail,
  cents, computeAlerts, nextMilestone,
} from '@/lib/v2/admin/adminData';
import type { OverviewStats, StripeStats, ReferralEconomics, FirstWeekUser } from '@/lib/v2/admin/adminTypes';

export default function OverviewTab() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [stripe, setStripe] = useState<StripeStats | null>(null);
  const [referralEcon, setReferralEcon] = useState<ReferralEconomics | null>(null);
  const [firstWeek, setFirstWeek] = useState<FirstWeekUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      fetchOverviewStats().then(setStats),
      fetchStripeStats().then(setStripe),
      fetchReferralEconomics().then(setReferralEcon),
      fetchAiDetail().then(d => setFirstWeek(d.firstWeekUsers)),
    ]).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !stats) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  const referralPct = stats.totalUsers > 0 ? (stats.referralCustomers / stats.totalUsers) * 100 : 0;
  const milestone = nextMilestone(stats.activeSubscriptions);
  const alerts = referralEcon ? computeAlerts(stats, stripe ?? ({} as StripeStats), referralEcon, firstWeek) : [];

  return (
    <View style={st.content}>
      {alerts.length > 0 ? (
        <>
          <SectionHeader label="ALERTS" count={alerts.length} />
          <AlertsList alerts={alerts} />
        </>
      ) : null}

      <SectionHeader label="GROWTH" />
      <KpiRow>
        <KpiCard label="Total reps" value={String(stats.totalUsers)} />
        <KpiCard label="Paying reps" value={String(stats.activeSubscriptions)} accent={colors.green} />
        <KpiCard label="MRR" value={stripe ? cents(stripe.mrr) : '…'} />
        <KpiCard label="New paid this month" value={String(stats.newPaidThisMonth)} accent={colors.gold} />
      </KpiRow>

      <SectionHeader label="REFERRALS" />
      <KpiRow>
        <KpiCard label="Referral customers" value={String(stats.referralCustomers)} />
        <KpiCard label="Referral %" value={`${referralPct.toFixed(1)}%`} />
        <KpiCard label="AI cost (all time)" value={cents(stats.totalAiCost)} />
        <KpiCard label="Open tickets" value={String(stats.openTickets)} accent={stats.openTickets > 0 ? colors.orange : undefined} />
      </KpiRow>

      {milestone ? (
        <>
          <SectionHeader label="NEXT MILESTONE" />
          <MilestoneBar current={stats.activeSubscriptions} target={milestone.target} label="Paying reps" />
        </>
      ) : null}

      {stripe?.error ? <Text style={st.hint}>Stripe: {stripe.error}</Text> : null}

      {stripe ? (
        <>
          <SectionHeader label="AI GROSS MARGIN" />
          <View style={st.marginCard}>
            <View style={st.marginRow}>
              <Text style={st.marginLabel}>Cash collected MTD</Text>
              <Text style={st.marginValue}>{cents(stripe.revenueThisMonth)}</Text>
            </View>
            <View style={st.marginRow}>
              <Text style={st.marginLabel}>AI cost (all time)</Text>
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
