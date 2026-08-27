import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, ListRow, LoadingState, ErrorState, EmptyState } from './atoms';
import { fetchAiUsage, cents, compact } from '@/lib/v2/admin/adminData';
import type { AiUsageRow } from '@/lib/v2/admin/adminTypes';

export default function AiUsageTab() {
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchAiUsage().then(setRows).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  if (error && !rows) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <LoadingState />;

  if (rows.length === 0) {
    return (
      <View style={st.content}>
        <EmptyState
          icon="🤖"
          title="No AI usage recorded"
          body="Rex usage data will appear here once customers start using the AI coach."
        />
      </View>
    );
  }

  const totalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
  const totalReqs = rows.reduce((sum, r) => sum + r.total_requests, 0);
  const totalTokens = rows.reduce((sum, r) => sum + r.total_input + r.total_output, 0);
  const avgCostPerReq = totalReqs > 0 ? totalCost / totalReqs : 0;
  const avgCostPerUser = rows.length > 0 ? totalCost / rows.length : 0;

  return (
    <View style={st.content}>
      <SectionHeader label="AI / REX OVERVIEW" />
      <KpiRow>
        <KpiCard label="Total cost" value={cents(totalCost)} />
        <KpiCard label="Total requests" value={compact(totalReqs)} />
        <KpiCard label="Total tokens" value={compact(totalTokens)} />
      </KpiRow>

      <SectionHeader label="AVERAGES" />
      <KpiRow>
        <KpiCard label="Cost per request" value={cents(avgCostPerReq)} />
        <KpiCard label="Cost per customer" value={cents(avgCostPerUser)} />
        <KpiCard label="Users with usage" value={String(rows.length)} />
      </KpiRow>

      <SectionHeader label="BY USER" count={rows.length} />
      {rows.map(r => (
        <ListRow key={r.user_id}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.name} numberOfLines={1}>
              {r.full_name || r.email || r.user_id.slice(0, 8)}
            </Text>
            <Text style={st.sub}>
              {compact(r.total_requests)} requests · {compact(r.total_input + r.total_output)} tokens
            </Text>
          </View>
          <Text style={st.cost}>{cents(r.total_cost)}</Text>
        </ListRow>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  name: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  sub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  cost: { fontSize: 14, fontWeight: '800', color: colors.gold },
});
