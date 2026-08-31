import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, LoadingState, ErrorState } from './atoms';
import { fetchStripeStats, cents } from '@/lib/v2/admin/adminData';
import type { StripeStats } from '@/lib/v2/admin/adminTypes';

export default function RevenueTab() {
  const [stripe, setStripe] = useState<StripeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchStripeStats().then(s => {
      if (s.error) setError(s.error);
      setStripe(s);
    }).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !stripe) return <ErrorState message={error} onRetry={load} />;
  if (!stripe) return <LoadingState />;

  if (stripe.error && !stripe.activeSubscriptions) {
    return (
      <View style={st.content}>
        <SectionHeader label="STRIPE" />
        <View style={st.errorCard}>
          <Text style={st.errorTitle}>Couldn't load Stripe data</Text>
          <Text style={st.errorBody}>{stripe.error}</Text>
          <Text style={st.hint}>Make sure STRIPE_SECRET_KEY is set in Supabase Edge Function secrets.</Text>
        </View>
      </View>
    );
  }

  const total = stripe.activeSubscriptions + stripe.trialingSubscriptions + stripe.pastDueSubscriptions;

  return (
    <View style={st.content}>
      {/* Three separate numbers, by design — never combined into one figure. */}
      <SectionHeader label="STRIPE ECONOMICS" />
      <KpiRow>
        <KpiCard label="MRR" value={cents(stripe.mrr)} sub="from live Stripe prices" />
        <KpiCard label="Cash collected MTD" value={cents(stripe.revenueThisMonth)} sub="net, after fees" />
        <KpiCard label="Referral credit value" value={cents(stripe.referralCreditValue)} sub={`${stripe.appliedRewardCount} applied`} accent={colors.gold} />
      </KpiRow>

      <SectionHeader label="REVENUE BREAKDOWN" />
      <View style={st.breakdownCard}>
        <View style={st.breakdownRow}>
          <Text style={st.breakdownLabel}>Gross revenue MTD</Text>
          <Text style={st.breakdownValue}>{cents(stripe.grossRevenueThisMonth)}</Text>
        </View>
        <View style={st.breakdownRow}>
          <Text style={st.breakdownLabel}>Stripe fees</Text>
          <Text style={[st.breakdownValue, { color: colors.red }]}>−{cents(stripe.stripeFeesThisMonth)}</Text>
        </View>
        <View style={[st.breakdownRow, st.breakdownTotal]}>
          <Text style={st.breakdownLabel}>Net cash collected</Text>
          <Text style={[st.breakdownValue, { color: colors.green }]}>{cents(stripe.revenueThisMonth)}</Text>
        </View>
        <View style={st.breakdownDivider} />
        <View style={st.breakdownRow}>
          <Text style={st.breakdownLabel}>Referral credits outstanding</Text>
          <Text style={[st.breakdownValue, { color: colors.gold }]}>{cents(stripe.referralCreditValue)}</Text>
        </View>
        <Text style={st.breakdownNote}>
          Shown separately — never subtracted from revenue. Credits are Stripe coupons applied to referrer/referred subscriptions, not cash paid out.
        </Text>
      </View>

      <SectionHeader label="SUBSCRIPTIONS" />
      <KpiRow>
        <KpiCard label="Active" value={String(stripe.activeSubscriptions)} accent={colors.green} />
        <KpiCard label="Trialing" value={String(stripe.trialingSubscriptions)} accent={colors.gold} />
        <KpiCard label="Past due" value={String(stripe.pastDueSubscriptions)} accent={stripe.pastDueSubscriptions > 0 ? colors.red : undefined} />
        <KpiCard label="New paid this month" value={String(stripe.newPaidThisMonth)} />
      </KpiRow>

      <SectionHeader label="CHURN" />
      <KpiRow>
        <KpiCard label="Canceled this month" value={String(stripe.canceledThisMonth)} accent={stripe.canceledThisMonth > 0 ? colors.red : undefined} />
        <KpiCard label="Pending credits" value={String(stripe.pendingRewardCount)} />
      </KpiRow>

      {total > 0 ? (
        <>
          <SectionHeader label="BREAKDOWN" />
          <View style={st.barOuter}>
            {stripe.activeSubscriptions > 0 ? (
              <View style={[st.barSeg, { flex: stripe.activeSubscriptions, backgroundColor: colors.green }]} />
            ) : null}
            {stripe.trialingSubscriptions > 0 ? (
              <View style={[st.barSeg, { flex: stripe.trialingSubscriptions, backgroundColor: colors.gold }]} />
            ) : null}
            {stripe.pastDueSubscriptions > 0 ? (
              <View style={[st.barSeg, { flex: stripe.pastDueSubscriptions, backgroundColor: colors.red }]} />
            ) : null}
          </View>
          <View style={st.legendRow}>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.green }]} />
              <Text style={st.legendText}>Active ({stripe.activeSubscriptions})</Text>
            </View>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.gold }]} />
              <Text style={st.legendText}>Trial ({stripe.trialingSubscriptions})</Text>
            </View>
            <View style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: colors.red }]} />
              <Text style={st.legendText}>Past due ({stripe.pastDueSubscriptions})</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  errorCard: {
    padding: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.md,
  },
  errorTitle: { fontSize: 14, fontWeight: '700', color: colors.red },
  errorBody: { fontSize: 12, color: colors.grey2, marginTop: 6 },
  hint: { fontSize: 11, color: colors.grey, marginTop: 8, fontStyle: 'italic' },

  breakdownCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    padding: 14,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.ink4,
    marginTop: 4,
    paddingTop: 10,
  },
  breakdownDivider: { height: 1, backgroundColor: colors.ink4, marginVertical: 10 },
  breakdownLabel: { fontSize: 13, color: colors.grey2 },
  breakdownValue: { fontSize: 14, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
  breakdownNote: { fontSize: 11, color: colors.grey, marginTop: 8, lineHeight: 16, fontStyle: 'italic' },

  barOuter: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: colors.ink4,
  },
  barSeg: { height: 12 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.grey2 },
});
