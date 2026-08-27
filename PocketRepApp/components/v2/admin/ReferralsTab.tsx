import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, ListRow, StatusPill, LoadingState, ErrorState, EmptyState } from './atoms';
import { fetchReferrals, fetchReferralRewardStats } from '@/lib/v2/admin/adminData';
import type { AdminReferral } from '@/lib/v2/admin/adminTypes';

export default function ReferralsTab() {
  const [referrals, setReferrals] = useState<AdminReferral[] | null>(null);
  const [rewardMonths, setRewardMonths] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      fetchReferrals().then(setReferrals),
      fetchReferralRewardStats().then(r => setRewardMonths(r.totalMonths)),
    ]).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !referrals) return <ErrorState message={error} onRetry={load} />;
  if (!referrals) return <LoadingState />;

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

  const verified = referrals.filter(r => r.status !== 'pending').length;
  const rewarded = referrals.filter(r => r.status === 'rewarded').length;

  return (
    <View style={st.content}>
      <SectionHeader label="REFERRAL PROGRAM" />
      <KpiRow>
        <KpiCard label="Total" value={String(referrals.length)} />
        <KpiCard label="Verified" value={String(verified)} accent={colors.gold} />
        <KpiCard label="Rewarded" value={String(rewarded)} accent={colors.green} />
        <KpiCard label="Free months" value={String(rewardMonths)} sub="given" />
      </KpiRow>

      <SectionHeader label="ALL REFERRALS" count={referrals.length} />
      {referrals.map(r => (
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
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  sub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  date: { fontSize: 10, fontWeight: '600', color: colors.grey, letterSpacing: 0.3 },
});
