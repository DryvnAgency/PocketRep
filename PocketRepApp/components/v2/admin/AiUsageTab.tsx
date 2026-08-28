import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';
import { KpiCard, KpiRow, SectionHeader, ListRow, LoadingState, ErrorState, EmptyState } from './atoms';
import { fetchAiUsage, fetchAiDetail, cents, compact, firstWeekSeverity } from '@/lib/v2/admin/adminData';
import { FIRST_WEEK_CEILING_CENTS } from '@/lib/v2/admin/adminTypes';
import type { AiUsageRow, AiModelBreakdown, FirstWeekUser } from '@/lib/v2/admin/adminTypes';

const SEVERITY_COLOR: Record<string, string> = {
  green: colors.green,
  yellow: colors.gold,
  orange: colors.orange,
  red: colors.red,
  deepRed: colors.red,
};

export default function AiUsageTab() {
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);
  const [byModel, setByModel] = useState<AiModelBreakdown[]>([]);
  const [firstWeek, setFirstWeek] = useState<FirstWeekUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    Promise.all([
      fetchAiUsage().then(setRows),
      fetchAiDetail().then(d => { setByModel(d.byModel); setFirstWeek(d.firstWeekUsers); }),
    ]).catch(e => setError(String(e)));
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

      {byModel.length > 0 ? (
        <>
          <SectionHeader label="BY MODEL" count={byModel.length} />
          {byModel.map(m => (
            <ListRow key={m.model}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name} numberOfLines={1}>{m.model}</Text>
                <Text style={st.sub}>
                  {compact(m.totalRequests)} requests · {compact(m.totalInput)} in / {compact(m.totalOutput)} out
                </Text>
              </View>
              <Text style={st.cost}>{cents(m.totalCost)}</Text>
            </ListRow>
          ))}
        </>
      ) : null}

      <SectionHeader label="FIRST-WEEK AI SAFETY" count={firstWeek.length} />
      <Text style={st.note}>New users, spend since signup. Ceiling: {cents(FIRST_WEEK_CEILING_CENTS)}.</Text>
      {firstWeek.length === 0 ? (
        <Text style={st.note}>No users in their first week right now.</Text>
      ) : (
        firstWeek.map(u => {
          const sev = firstWeekSeverity(u.costCents);
          const color = SEVERITY_COLOR[sev];
          return (
            <ListRow key={u.userId}>
              <View style={[st.severityDot, { backgroundColor: color }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.name} numberOfLines={1}>{u.fullName || u.email}</Text>
                <Text style={st.sub}>{u.requestCount} requests since {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </View>
              <Text style={[st.cost, { color }]}>{cents(u.costCents)}</Text>
            </ListRow>
          );
        })
      )}

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
  note: { fontSize: 11, color: colors.grey, marginBottom: 6, fontStyle: 'italic' },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
});
