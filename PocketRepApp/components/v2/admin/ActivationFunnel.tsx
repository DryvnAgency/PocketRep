import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { ErrorState, KpiCard, KpiRow, LoadingState, SectionHeader } from './atoms';

type ActivationSummary = {
  signed_up: number;
  onboarded: number;
  real_contact: number;
  rex: number;
  customer_action: number;
  sequence: number;
  deal: number;
  returned_24h: number;
  returned_7d: number;
  referral_conversion: number;
};

type ActivationUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  onboarding_complete: boolean;
  has_real_contact: boolean;
  has_rex_turn: boolean;
  has_customer_action: boolean;
  has_sequence: boolean;
  has_deal: boolean;
  returned_24h: boolean;
  returned_7d: boolean;
  has_referral_conversion: boolean;
};

type ActivationData = { summary: ActivationSummary; users: ActivationUser[] };

const MARKS: Array<{ key: keyof ActivationUser; short: string; label: string }> = [
  { key: 'onboarding_complete', short: 'SETUP', label: 'Setup complete' },
  { key: 'has_real_contact', short: 'BOOK', label: 'Real contact added/imported' },
  { key: 'has_rex_turn', short: 'REX', label: 'First Rex conversation' },
  { key: 'has_customer_action', short: 'ACT', label: 'First real customer action' },
  { key: 'has_sequence', short: 'SEQ', label: 'First sequence enrollment' },
  { key: 'has_deal', short: 'DEAL', label: 'First deal logged' },
  { key: 'returned_24h', short: 'D2', label: 'Returned after 24 hours' },
  { key: 'returned_7d', short: 'D7', label: 'Returned after 6 days' },
  { key: 'has_referral_conversion', short: 'REF', label: 'Referral converted' },
];

export default function ActivationFunnel() {
  const [data, setData] = useState<ActivationData | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const { data: payload, error: rpcError } = await supabase.rpc('admin_activation_funnel');
      if (rpcError) throw rpcError;
      setData(payload as ActivationData);
    } catch (e: unknown) {
      setError(String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;

  const s = data.summary;
  return (
    <View style={st.wrap}>
      <SectionHeader label="FIRST 250 ACTIVATION" count={s.signed_up} />
      <Text style={st.explainer}>
        Real PocketRep milestones from the rep's own book. Demo contacts do not count as book activation.
      </Text>
      <KpiRow>
        <KpiCard label="Setup" value={`${s.onboarded}/${s.signed_up}`} />
        <KpiCard label="Worked book" value={`${s.real_contact}/${s.signed_up}`} accent={colors.gold} />
        <KpiCard label="Used Rex" value={`${s.rex}/${s.signed_up}`} />
        <KpiCard label="Customer action" value={`${s.customer_action}/${s.signed_up}`} />
      </KpiRow>
      <KpiRow>
        <KpiCard label="Sequence" value={`${s.sequence}/${s.signed_up}`} />
        <KpiCard label="Deal" value={`${s.deal}/${s.signed_up}`} accent={s.deal > 0 ? colors.green : undefined} />
        <KpiCard label="Returned 24h+" value={`${s.returned_24h}/${s.signed_up}`} />
        <KpiCard label="Returned 7d+" value={`${s.returned_7d}/${s.signed_up}`} />
      </KpiRow>

      <Text style={st.note}>
        REF means a real referred signup exists. PocketRep does not currently claim a referral was merely shared or copied.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.table}>
        <View>
          <View style={[st.row, st.headerRow]}>
            <Text style={[st.nameCell, st.headerText]}>REP</Text>
            {MARKS.map(m => <Text key={m.key} style={[st.markCell, st.headerText]}>{m.short}</Text>)}
          </View>
          {data.users.map(u => (
            <View key={u.user_id} style={st.row}>
              <View style={st.nameCell}>
                <Text style={st.name}>{u.full_name || u.email.split('@')[0]}</Text>
                <Text style={st.email}>{u.email}</Text>
              </View>
              {MARKS.map(m => (
                <View key={m.key} style={st.markCell} accessibilityLabel={`${m.label}: ${u[m.key] ? 'yes' : 'no'}`}>
                  <Text style={u[m.key] ? st.yes : st.no}>{u[m.key] ? '✓' : '·'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 8 },
  explainer: { color: colors.grey2, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  note: { color: colors.grey, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 10 },
  table: { paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.ink4 },
  headerRow: { minHeight: 34, backgroundColor: colors.surface2, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  headerText: { color: colors.grey, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  nameCell: { width: 190, paddingHorizontal: 10, paddingVertical: 7 },
  markCell: { width: 48, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.white, fontSize: 12, fontWeight: '700' },
  email: { color: colors.grey, fontSize: 9, marginTop: 2 },
  yes: { color: colors.green, fontSize: 17, fontWeight: '900' },
  no: { color: colors.grey, fontSize: 17 },
});
