import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import {
  KpiCard, KpiRow, SectionHeader, ListRow, StatusPill, LoadingState, ErrorState, EmptyState,
  DateRangeSelector,
} from './atoms';
import GrowthCalculator from './GrowthCalculator';
import {
  fetchReferrals, fetchReferralRewardStats, fetchReferralEconomics, fetchOverviewStats, fetchStripeStats,
  buildDateRanges, cents,
} from '@/lib/v2/admin/adminData';
import { REFERRAL_CREDIT_CAP, REFERRAL_CREDIT_CAP_WARN } from '@/lib/v2/admin/adminTypes';
import type {
  AdminReferral, ReferralEconomics, OverviewStats, StripeStats, DateRange,
} from '@/lib/v2/admin/adminTypes';

const FUNNEL_STEPS: { key: keyof ReferralEconomics['funnel']; label: string }[] = [
  { key: 'signups', label: 'Signups' },
  { key: 'verified', label: 'Verified' },
  { key: 'paid', label: 'Paid' },
  { key: 'rewarded', label: 'Rewarded' },
  { key: 'active', label: 'Active' },
];

export default function ReferralsTab() {
  const ranges = useMemo(() => buildDateRanges(), []);
  const [range, setRange] = useState<DateRange>(ranges[0]); // "All time" default

  const [referrals, setReferrals] = useState<AdminReferral[] | null>(null);
  const [rewardMonths, setRewardMonths] = useState(0);
  const [econ, setEcon] = useState<ReferralEconomics | null>(null);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [stripe, setStripe] = useState<StripeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEcon = (r: DateRange) => {
    fetchReferralEconomics(r).then(setEcon).catch(e => setError(String(e)));
  };

  const load = () => {
    setError(null);
    Promise.all([
      fetchReferrals().then(setReferrals),
      fetchReferralRewardStats().then(r => setRewardMonths(r.totalMonths)),
      fetchOverviewStats().then(setOverview),
      fetchStripeStats().then(setStripe),
    ]).catch(e => setError(String(e)));
    loadEcon(range);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectRange = (r: DateRange) => {
    setRange(r);
    loadEcon(r);
  };

  if (error && !referrals) return <ErrorState message={error} onRetry={load} />;
  if (!referrals || !econ) return <LoadingState />;

  if (referrals.length === 0) {
    return (
      <View style={st.content}>
        <EmptyState
          icon="🔗"
          title="No referrals yet"
          body="Referral program is active — conversions will appear here."
        />
      </View>
    );
  }

  const filteredReferrals = referrals.filter(r => {
    if (!range.start && !range.end) return true;
    const d = r.created_at.slice(0, 10);
    if (range.start && d < range.start) return false;
    if (range.end && d > range.end) return false;
    return true;
  });

  const referralPct = overview && overview.totalUsers > 0
    ? (overview.referralCustomers / overview.totalUsers) * 100
    : 0;

  const maxFunnel = Math.max(1, econ.funnel.signups);
  const nearCap = econ.advocates.filter(a => a.lifetimeCredits >= REFERRAL_CREDIT_CAP_WARN && a.lifetimeCredits < REFERRAL_CREDIT_CAP);
  const atCap = econ.advocates.filter(a => a.lifetimeCredits >= REFERRAL_CREDIT_CAP);
  // Credit liability = applied credits valued at the current average subscription price.
  const avgMonthlyPrice = stripe && stripe.activeSubscriptions > 0 ? stripe.mrr / stripe.activeSubscriptions : 0;
  const creditLiability = econ.credits.applied * avgMonthlyPrice;

  return (
    <View style={st.content}>
      <DateRangeSelector ranges={ranges} selected={range.key} onSelect={onSelectRange} />

      <SectionHeader label="REFERRAL PROGRAM" />
      <KpiRow>
        <KpiCard label="Total referrals" value={String(econ.funnel.signups)} />
        <KpiCard label="Verified" value={String(econ.funnel.verified)} accent={colors.gold} />
        <KpiCard label="Rewarded" value={String(econ.funnel.rewarded)} accent={colors.green} />
        <KpiCard label="Referral %" value={`${referralPct.toFixed(1)}%`} />
      </KpiRow>

      <SectionHeader label="FUNNEL" />
      <View style={st.funnelCard}>
        {FUNNEL_STEPS.map(step => {
          const value = econ.funnel[step.key];
          const pct = maxFunnel > 0 ? (value / maxFunnel) * 100 : 0;
          return (
            <View key={step.key} style={st.funnelRow}>
              <Text style={st.funnelLabel}>{step.label}</Text>
              <View style={st.funnelTrack}>
                <View style={[st.funnelFill, { width: `${Math.max(2, pct)}%` }]} />
              </View>
              <Text style={st.funnelValue}>{value}</Text>
            </View>
          );
        })}
        <Text style={st.funnelNote}>Clicks aren't tracked yet — funnel starts at signup.</Text>
      </View>

      <SectionHeader label="CREDIT ECONOMICS" />
      <KpiRow>
        <KpiCard label="Issued" value={String(econ.credits.totalIssued)} />
        <KpiCard label="Applied" value={String(econ.credits.applied)} accent={colors.green} />
        <KpiCard label="Pending" value={String(econ.credits.pending)} accent={colors.gold} />
        <KpiCard label="Failed" value={String(econ.credits.failed)} accent={econ.credits.failed > 0 ? colors.red : undefined} />
      </KpiRow>
      <KpiRow>
        <KpiCard label="Estimated credit liability" value={cents(creditLiability)} sub="applied credits × avg. sub price" accent={colors.gold} />
        <KpiCard label="Free months given" value={String(rewardMonths)} />
      </KpiRow>

      <SectionHeader label="REFERRAL QUALITY" />
      <KpiRow>
        <KpiCard label="Avg referrals / advocate" value={econ.quality.avgReferralsPerAdvocate.toFixed(2)} />
        <KpiCard label="Referred 1+" value={`${econ.quality.pctReferred1}%`} />
        <KpiCard label="Referred 2+" value={`${econ.quality.pctReferred2Plus}%`} />
        <KpiCard label="Referred 5+" value={`${econ.quality.pctReferred5Plus}%`} />
      </KpiRow>

      <SectionHeader label="TOP ADVOCATES" count={econ.topAdvocates.length} />
      {econ.topAdvocates.length === 0 ? (
        <Text style={st.emptyNote}>No advocates yet.</Text>
      ) : (
        econ.topAdvocates.map(a => (
          <ListRow key={a.userId}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{a.name || a.email}</Text>
              <Text style={st.sub}>{a.referralCount} referred · {a.rewardedCount} rewarded</Text>
            </View>
            <Text style={st.credits}>{a.lifetimeCredits} credits</Text>
          </ListRow>
        ))
      )}

      <SectionHeader label="24-MONTH CREDIT CAP" />
      <KpiRow>
        <KpiCard label="At cap (24)" value={String(atCap.length)} accent={atCap.length > 0 ? colors.red : undefined} />
        <KpiCard label="Near cap (20–23)" value={String(nearCap.length)} accent={nearCap.length > 0 ? colors.orange : undefined} />
      </KpiRow>
      {nearCap.length + atCap.length > 0 ? (
        [...atCap, ...nearCap].map(a => (
          <ListRow key={a.userId}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{a.name || a.email}</Text>
            </View>
            <Text style={[st.credits, a.lifetimeCredits >= REFERRAL_CREDIT_CAP ? { color: colors.red } : { color: colors.orange }]}>
              {a.lifetimeCredits} / {REFERRAL_CREDIT_CAP}
            </Text>
          </ListRow>
        ))
      ) : (
        <Text style={st.emptyNote}>No advocates near the 24-month cap.</Text>
      )}

      {overview && stripe ? (
        <View style={{ marginTop: 8 }}>
          <GrowthCalculator overview={overview} stripe={stripe} />
        </View>
      ) : null}

      <SectionHeader label="ALL REFERRALS" count={filteredReferrals.length} />
      {filteredReferrals.length === 0 ? (
        <Text style={st.emptyNote}>No referrals in this range.</Text>
      ) : (
        filteredReferrals.map(r => (
          <ListRow key={r.id}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>
                {r.referrer_name || r.referrer_user_id.slice(0, 8)}
              </Text>
              <Text style={st.sub} numberOfLines={1}>
                → {r.referred_email ?? '(pending)'}
              </Text>
            </View>
            <StatusPill status={r.status} />
            <Text style={st.date}>
              {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </ListRow>
        ))
      )}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  sub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  date: { fontSize: 10, fontWeight: '600', color: colors.grey, letterSpacing: 0.3 },
  credits: { fontSize: 13, fontWeight: '800', color: colors.gold },
  emptyNote: { fontSize: 12, color: colors.grey, fontStyle: 'italic', marginBottom: 4 },

  funnelCard: {
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    gap: 8,
  },
  funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelLabel: { width: 66, fontSize: 11, color: colors.grey2 },
  funnelTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.ink4, overflow: 'hidden' },
  funnelFill: { height: 10, backgroundColor: colors.gold, borderRadius: 5 },
  funnelValue: { width: 34, textAlign: 'right', fontSize: 12, fontWeight: '700', color: colors.white, fontVariant: ['tabular-nums'] },
  funnelNote: { fontSize: 10, color: colors.grey, marginTop: 4, fontStyle: 'italic' },
});
