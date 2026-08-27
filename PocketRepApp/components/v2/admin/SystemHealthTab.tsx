// Owner Control Center — System Health tab
// Checks connectivity to Stripe, AI proxy, and database.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { SectionHeader, HealthDot } from './atoms';
import { supabase } from '@/lib/supabase';

type CheckStatus = 'checking' | 'ok' | 'warn' | 'error';

type HealthCheck = {
  label: string;
  status: CheckStatus;
  detail: string;
};

export default function SystemHealthTab() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runChecks = async () => {
    const results: HealthCheck[] = [
      { label: 'Database', status: 'checking', detail: 'Checking…' },
      { label: 'Stripe (admin-stats)', status: 'checking', detail: 'Checking…' },
      { label: 'AI Proxy', status: 'checking', detail: 'Checking…' },
    ];
    setChecks([...results]);

    // Database
    try {
      const start = Date.now();
      const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      const ms = Date.now() - start;
      results[0] = error
        ? { label: 'Database', status: 'error', detail: error.message }
        : { label: 'Database', status: 'ok', detail: `Connected (${ms}ms)` };
    } catch (e) {
      results[0] = { label: 'Database', status: 'error', detail: String(e) };
    }
    setChecks([...results]);

    // Stripe via admin-stats
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('admin-stats');
      const ms = Date.now() - start;
      if (error) {
        results[1] = { label: 'Stripe (admin-stats)', status: 'error', detail: error.message };
      } else if (data?.error) {
        results[1] = { label: 'Stripe (admin-stats)', status: 'warn', detail: data.error };
      } else {
        results[1] = { label: 'Stripe (admin-stats)', status: 'ok', detail: `Connected (${ms}ms)` };
      }
    } catch (e) {
      results[1] = { label: 'Stripe (admin-stats)', status: 'error', detail: String(e) };
    }
    setChecks([...results]);

    // AI Proxy
    try {
      const start = Date.now();
      const { error } = await supabase.functions.invoke('ai-proxy', {
        method: 'GET',
      });
      const ms = Date.now() - start;
      // ai-proxy may return an error for GET, but if it responds at all it's alive
      results[2] = {
        label: 'AI Proxy',
        status: error && !error.message?.includes('method') ? 'warn' : 'ok',
        detail: error ? `Reachable (${ms}ms) — ${error.message}` : `Connected (${ms}ms)`,
      };
    } catch (e) {
      results[2] = { label: 'AI Proxy', status: 'error', detail: String(e) };
    }
    setChecks([...results]);
    setLastRun(new Date());
  };

  useEffect(() => { runChecks(); }, []);

  return (
    <View style={st.content}>
      <SectionHeader label="SYSTEM HEALTH" />

      {checks.map((c, i) => (
        <View key={i} style={st.checkRow}>
          <HealthDot status={c.status === 'checking' ? 'unknown' : c.status} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.checkLabel}>{c.label}</Text>
            <Text style={st.checkDetail} numberOfLines={2}>{c.detail}</Text>
          </View>
        </View>
      ))}

      {lastRun ? (
        <Text style={st.lastRun}>
          Last checked: {lastRun.toLocaleTimeString()}
        </Text>
      ) : null}

      <Pressable onPress={runChecks} style={st.rerunBtn}>
        <Text style={st.rerunText}>Run checks again</Text>
      </Pressable>

      <SectionHeader label="EDGE FUNCTIONS" />
      <Text style={st.note}>
        Edge function status is managed in the Supabase dashboard. This panel checks connectivity only.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  checkLabel: { fontSize: 14, fontWeight: '600', color: colors.white },
  checkDetail: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  lastRun: { fontSize: 11, color: colors.grey, marginTop: 8, textAlign: 'center' },
  rerunBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  rerunText: { fontSize: 12, fontWeight: '700', color: colors.gold },
  note: { fontSize: 12, color: colors.grey2, lineHeight: 18 },
});
