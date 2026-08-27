// Owner Control Center — Outreach tab
// Aggregate SMS, sequence, nurture, and follow-up metrics.

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, LoadingState, ErrorState } from './atoms';
import { fetchOutreachStats } from '@/lib/v2/admin/adminData';
import type { OutreachStats } from '@/lib/v2/admin/adminTypes';

export default function OutreachTab() {
  const [stats, setStats] = useState<OutreachStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchOutreachStats().then(setStats).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !stats) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  const smsRate = stats.smsTotal > 0
    ? `${Math.round((stats.smsConfirmed / stats.smsTotal) * 100)}%`
    : '—';
  const nurtureReplyRate = stats.nurtureSent > 0
    ? `${Math.round((stats.nurtureReplied / stats.nurtureSent) * 100)}%`
    : '—';

  return (
    <View style={st.content}>
      <SectionHeader label="SMS" />
      <KpiRow>
        <KpiCard label="Total sent" value={String(stats.smsTotal)} />
        <KpiCard label="Confirmed" value={String(stats.smsConfirmed)} accent={colors.green} />
        <KpiCard label="Confirm rate" value={smsRate} />
      </KpiRow>

      <SectionHeader label="SEQUENCES" />
      <KpiRow>
        <KpiCard label="Total created" value={String(stats.sequencesTotal)} />
        <KpiCard label="Approved / Sent" value={String(stats.sequencesApproved)} accent={colors.green} />
      </KpiRow>

      <SectionHeader label="NURTURE MESSAGES" />
      <KpiRow>
        <KpiCard label="Generated" value={String(stats.nurtureGenerated)} />
        <KpiCard label="Sent" value={String(stats.nurtureSent)} accent={colors.gold} />
        <KpiCard label="Replied" value={String(stats.nurtureReplied)} accent={colors.green} />
        <KpiCard label="Reply rate" value={nurtureReplyRate} />
      </KpiRow>

      <SectionHeader label="FOLLOW-UPS" />
      <KpiRow>
        <KpiCard
          label="Overdue"
          value={String(stats.overdueFollowups)}
          accent={stats.overdueFollowups > 0 ? colors.red : undefined}
          sub="across all users"
        />
      </KpiRow>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
});
