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
      <SectionHeader label="MONTHLY RECURRING REVENUE" />
      <View style={st.mrrCard}>
        <Text style={st.mrrValue}>{cents(stripe.mrr)}</Text>
        <Text style={st.mrrLabel}>MRR</Text>
      </View>

      <SectionHeader label="REVENUE THIS MONTH" />
      <KpiRow>
        <KpiCard label="Net revenue" value={cents(stripe.revenueThisMonth)} sub="after Stripe fees" />
      </KpiRow>

      <SectionHeader label="SUBSCRIPTIONS" />
      <KpiRow>
        <KpiCard label="Active" value={String(stripe.activeSubscriptions)} accent={colors.green} />
        <KpiCard label="Trialing" value={String(stripe.trialingSubscriptions)} accent={colors.gold} />
        <KpiCard label="Past due" value={String(stripe.pastDueSubscriptions)} accent={stripe.pastDueSubscriptions > 0 ? colors.red : undefined} />
      </KpiRow>

      <SectionHeader label="CHURN" />
      <KpiRow>
        <KpiCard label="Canceled this month" value={String(stripe.canceledThisMonth)} accent={stripe.canceledThisMonth > 0 ? colors.red : undefined} />
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
  mrrCard: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    borderRadius: radius.lg,
    padding: 24,
    alignItems: 'center',
  },
  mrrValue: { fontSize: 36, fontWeight: '900', color: colors.gold, fontVariant: ['tabular-nums'] },
  mrrLabel: { fontSize: 11, fontWeight: '700', color: colors.grey, letterSpacing: 1.5, marginTop: 4 },
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
