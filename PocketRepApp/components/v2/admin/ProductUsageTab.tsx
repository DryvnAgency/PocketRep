// Owner Control Center — Product Usage tab
// Feature adoption metrics from existing data — no third-party analytics needed.

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, LoadingState, ErrorState } from './atoms';
import ActivationFunnel from './ActivationFunnel';
import { fetchProductUsage, compact } from '@/lib/v2/admin/adminData';
import type { ProductUsageStats } from '@/lib/v2/admin/adminTypes';

export default function ProductUsageTab() {
  const [stats, setStats] = useState<ProductUsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchProductUsage().then(setStats).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !stats) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  const ix = stats.interactionsByType;
  const totalInteractions = ix.call + ix.text + ix.email + ix.note;

  return (
    <View style={st.content}>
      <ActivationFunnel />

      <SectionHeader label="CONTACTS" />
      <KpiRow>
        <KpiCard label="Total" value={compact(stats.totalContacts)} />
        <KpiCard label="This week" value={String(stats.contactsThisWeek)} accent={stats.contactsThisWeek > 0 ? colors.green : undefined} />
        <KpiCard label="This month" value={String(stats.contactsThisMonth)} />
      </KpiRow>

      <SectionHeader label="DEALS" />
      <KpiRow>
        <KpiCard label="Total deals" value={String(stats.totalDeals)} />
        <KpiCard label="Gross total" value={`$${compact(stats.totalGross)}`} accent={colors.gold} />
      </KpiRow>

      <SectionHeader label="FEATURES" />
      <KpiRow>
        <KpiCard label="Sequences" value={String(stats.totalSequences)} />
        <KpiCard label="Nurture msgs" value={String(stats.totalNurtures)} />
        <KpiCard label="Rex messages" value={String(stats.totalRexMessages)} />
        <KpiCard label="Weekly digests" value={String(stats.totalDigests)} />
      </KpiRow>

      <SectionHeader label="INTERACTIONS" count={totalInteractions} />
      <View style={st.ixGrid}>
        <IxCard label="Calls" value={ix.call} icon="📞" />
        <IxCard label="Texts" value={ix.text} icon="💬" />
        <IxCard label="Emails" value={ix.email} icon="📧" />
        <IxCard label="Notes" value={ix.note} icon="📝" />
      </View>

      <SectionHeader label="DATA UNAVAILABLE" />
      <View style={st.unavailable}>
        <Text style={st.unavailableText}>
          Screen views and session duration still require additional instrumentation. The first-250 activation funnel above is derived from PocketRep's existing first-party records.
        </Text>
      </View>
    </View>
  );
}

function IxCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <View style={st.ixCard}>
      <Text style={st.ixIcon}>{icon}</Text>
      <Text style={st.ixValue}>{value}</Text>
      <Text style={st.ixLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  ixGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ixCard: {
    flex: 1,
    minWidth: 80,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ixIcon: { fontSize: 20, marginBottom: 4 },
  ixValue: { fontSize: 20, fontWeight: '800', color: colors.white, fontVariant: ['tabular-nums'] },
  ixLabel: { fontSize: 10, fontWeight: '700', color: colors.grey, marginTop: 2, letterSpacing: 0.5 },
  unavailable: {
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  unavailableText: { fontSize: 12, color: colors.grey2, lineHeight: 18 },
});
