import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, Pressable,
  TextInput, StyleSheet, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';

interface MonthlyDeal {
  id: string;
  customer_name: string | null;
  vehicle: string | null;
  commission: number;
  notes: string | null;
  created_at: string;
}

interface MonthlyMetric {
  id: string;
  month_label: string;
  total_commission: number;
  units_sold: number;
  closed_at: string | null;
  created_at: string;
  deals?: MonthlyDeal[];
}

export default function MetricsScreen() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState<MonthlyMetric | null>(null);
  const [currentDeals, setCurrentDeals] = useState<MonthlyDeal[]>([]);
  const [archivedMonths, setArchivedMonths] = useState<MonthlyMetric[]>([]);
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null);
  const [showLogDeal, setShowLogDeal] = useState(false);
  const [showCloseMonth, setShowCloseMonth] = useState(false);
  const [dealForm, setDealForm] = useState({ customer_name: '', vehicle: '', commission: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: months } = await supabase
      .from('monthly_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!months?.length) {
      // Auto-create current month
      const label = getMonthLabel(new Date());
      const { data: created } = await supabase
        .from('monthly_metrics')
        .insert({ user_id: user.id, month_label: label })
        .select()
        .single();
      setCurrentMonth(created ?? null);
      setCurrentDeals([]);
      setArchivedMonths([]);
    } else {
      const open = months.find(m => !m.closed_at) ?? months[0];
      setCurrentMonth(open);

      const { data: deals } = await supabase
        .from('monthly_deals')
        .select('*')
        .eq('month_id', open.id)
        .order('created_at', { ascending: false });
      setCurrentDeals(deals ?? []);

      const closed = months.filter(m => m.closed_at);
      setArchivedMonths(closed);
    }
    setLoading(false);
  }

  async function logDeal() {
    const commission = parseFloat(dealForm.commission);
    if (!dealForm.commission || isNaN(commission)) {
      Alert.alert('Commission required', 'Enter the commission amount for this deal.');
      return;
    }
    if (!currentMonth) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('monthly_deals').insert({
      user_id: user.id,
      month_id: currentMonth.id,
      customer_name: dealForm.customer_name || null,
      vehicle: dealForm.vehicle || null,
      commission,
      notes: dealForm.notes || null,
    });

    // Update month totals
    const newTotal = currentDeals.reduce((s, d) => s + d.commission, 0) + commission;
    const newUnits = currentDeals.length + 1;
    await supabase
      .from('monthly_metrics')
      .update({ total_commission: newTotal, units_sold: newUnits })
      .eq('id', currentMonth.id);

    setDealForm({ customer_name: '', vehicle: '', commission: '', notes: '' });
    setShowLogDeal(false);
    setSaving(false);
    loadAll();
  }

  async function closeMonth() {
    if (!currentMonth) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase
      .from('monthly_metrics')
      .update({ closed_at: new Date().toISOString() })
      .eq('id', currentMonth.id);

    const label = getMonthLabel(new Date());
    await supabase
      .from('monthly_metrics')
      .insert({ user_id: user.id, month_label: label });

    setSaving(false);
    setShowCloseMonth(false);
    loadAll();
  }

  async function deleteDeal(deal: MonthlyDeal) {
    if (!currentMonth) return;
    Alert.alert('Remove deal?', `${deal.customer_name ?? 'Deal'} — $${deal.commission.toLocaleString()}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          await supabase.from('monthly_deals').delete().eq('id', deal.id);
          const remaining = currentDeals.filter(d => d.id !== deal.id);
          const newTotal = remaining.reduce((s, d) => s + d.commission, 0);
          await supabase
            .from('monthly_metrics')
            .update({ total_commission: newTotal, units_sold: remaining.length })
            .eq('id', currentMonth.id);
          loadAll();
        },
      },
    ]);
  }

  function getMonthLabel(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function fmt(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }

  const avg = currentDeals.length > 0 ? (currentMonth?.total_commission ?? 0) / currentDeals.length : 0;

  if (loading) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>My Month</Text>
        <Text style={s.headerSub}>{currentMonth?.month_label ?? ''}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{fmt(currentMonth?.total_commission ?? 0)}</Text>
            <Text style={s.statLabel}>COMMISSION</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{currentMonth?.units_sold ?? 0}</Text>
            <Text style={s.statLabel}>UNITS</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{currentDeals.length > 0 ? fmt(avg) : '—'}</Text>
            <Text style={s.statLabel}>AVG/UNIT</Text>
          </View>
        </View>

        {/* Log a deal button */}
        <TouchableOpacity style={s.logBtn} onPress={() => setShowLogDeal(true)} activeOpacity={0.85}>
          <Text style={s.logBtnText}>+ Log a Deal</Text>
        </TouchableOpacity>

        {/* Deals list */}
        {currentDeals.length > 0 ? (
          <>
            <Text style={s.sectionLabel}>THIS MONTH</Text>
            {currentDeals.map(deal => (
              <TouchableOpacity
                key={deal.id}
                style={s.dealRow}
                onLongPress={() => deleteDeal(deal)}
                activeOpacity={0.8}
              >
                <View style={s.dealLeft}>
                  <Text style={s.dealName}>{deal.customer_name ?? 'Deal'}</Text>
                  {deal.vehicle ? <Text style={s.dealVehicle}>{deal.vehicle}</Text> : null}
                  {deal.notes ? <Text style={s.dealNotes}>{deal.notes}</Text> : null}
                </View>
                <Text style={s.dealCommission}>{fmt(deal.commission)}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>💰</Text>
            <Text style={s.emptyText}>No deals logged yet this month</Text>
            <Text style={s.emptySub}>Tap "Log a Deal" after every car you sell</Text>
          </View>
        )}

        {/* Close month */}
        {currentDeals.length > 0 && (
          <TouchableOpacity style={s.closeBtn} onPress={() => setShowCloseMonth(true)} activeOpacity={0.8}>
            <Text style={s.closeBtnText}>Close Month →</Text>
          </TouchableOpacity>
        )}

        {/* Archived months */}
        {archivedMonths.length > 0 && (
          <>
            <Text style={s.sectionLabel}>HISTORY</Text>
            {archivedMonths.map(month => (
              <TouchableOpacity
                key={month.id}
                style={s.archiveRow}
                onPress={() => setExpandedArchive(expandedArchive === month.id ? null : month.id)}
                activeOpacity={0.8}
              >
                <View style={s.archiveHeader}>
                  <Text style={s.archiveLabel}>{month.month_label}</Text>
                  <View style={s.archiveRight}>
                    <Text style={s.archiveCommission}>{fmt(month.total_commission)}</Text>
                    <Text style={s.archiveUnits}>{month.units_sold} units</Text>
                    <Text style={s.archiveChevron}>{expandedArchive === month.id ? '▲' : '▼'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* Log Deal Modal */}
      <Modal visible={showLogDeal} animationType="slide" transparent>
        <Pressable style={s.overlay} onPress={() => setShowLogDeal(false)}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Log a Deal</Text>

            <Text style={s.fieldLabel}>Customer Name</Text>
            <TextInput
              style={s.input}
              value={dealForm.customer_name}
              onChangeText={v => setDealForm(f => ({ ...f, customer_name: v }))}
              placeholder="John Smith"
              placeholderTextColor={colors.grey}
            />

            <Text style={s.fieldLabel}>Vehicle</Text>
            <TextInput
              style={s.input}
              value={dealForm.vehicle}
              onChangeText={v => setDealForm(f => ({ ...f, vehicle: v }))}
              placeholder="2024 Toyota Camry"
              placeholderTextColor={colors.grey}
            />

            <Text style={s.fieldLabel}>Commission *</Text>
            <TextInput
              style={s.input}
              value={dealForm.commission}
              onChangeText={v => setDealForm(f => ({ ...f, commission: v }))}
              placeholder="1200"
              placeholderTextColor={colors.grey}
              keyboardType="decimal-pad"
            />

            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput
              style={[s.input, { height: 72, textAlignVertical: 'top' }]}
              value={dealForm.notes}
              onChangeText={v => setDealForm(f => ({ ...f, notes: v }))}
              placeholder="Front gross, back products, etc."
              placeholderTextColor={colors.grey}
              multiline
            />

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowLogDeal(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={logDeal} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={s.saveBtnText}>Log Deal</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Close Month Modal */}
      <Modal visible={showCloseMonth} animationType="fade" transparent>
        <Pressable style={s.overlay} onPress={() => setShowCloseMonth(false)}>
          <Pressable style={s.sheet} onPress={e => e.stopPropagation()}>
            <Text style={s.sheetTitle}>Close {currentMonth?.month_label}?</Text>
            <Text style={s.sheetSub}>
              This archives {currentDeals.length} deal{currentDeals.length !== 1 ? 's' : ''} totaling {fmt(currentMonth?.total_commission ?? 0)} and starts a new month. You can still view the history.
            </Text>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCloseMonth(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Not Yet</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={closeMonth} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={s.saveBtnText}>Close Month</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: colors.grey2, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.ink4, alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.gold, letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: colors.grey2, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  logBtn: {
    marginHorizontal: spacing.lg, marginVertical: spacing.sm,
    backgroundColor: colors.gold, borderRadius: radius.md, padding: spacing.md, alignItems: 'center',
  },
  logBtnText: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: colors.gold, letterSpacing: 0.8,
    textTransform: 'uppercase', paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xs,
  },
  dealRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, marginHorizontal: spacing.lg, marginBottom: 2,
    borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.ink4,
  },
  dealLeft: { flex: 1, marginRight: spacing.sm },
  dealName: { fontSize: 14, fontWeight: '700', color: colors.white },
  dealVehicle: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  dealNotes: { fontSize: 11, color: colors.grey, marginTop: 2 },
  dealCommission: { fontSize: 16, fontWeight: '800', color: colors.green },
  emptyState: { alignItems: 'center', padding: spacing.xxl, paddingTop: spacing.xl * 2 },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: spacing.xs },
  emptySub: { fontSize: 12, color: colors.grey2, textAlign: 'center' },
  closeBtn: {
    marginHorizontal: spacing.lg, marginTop: spacing.xl,
    borderWidth: 1, borderColor: colors.ink4, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center',
  },
  closeBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 13 },
  archiveRow: {
    backgroundColor: colors.surface2, marginHorizontal: spacing.lg, marginBottom: 2,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.ink4, overflow: 'hidden',
  },
  archiveHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md,
  },
  archiveLabel: { fontSize: 13, fontWeight: '700', color: colors.white },
  archiveRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  archiveCommission: { fontSize: 14, fontWeight: '700', color: colors.gold },
  archiveUnits: { fontSize: 11, color: colors.grey2 },
  archiveChevron: { color: colors.grey, fontSize: 10, marginLeft: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, paddingBottom: 36,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.white, marginBottom: 4 },
  sheetSub: { fontSize: 13, color: colors.grey2, lineHeight: 20, marginBottom: spacing.lg },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.grey2, letterSpacing: 0.4, marginBottom: 5, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.ink3, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.md, color: colors.white, fontSize: 14,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.md, alignItems: 'center',
  },
  cancelBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 14 },
  saveBtn: {
    flex: 2, backgroundColor: colors.gold,
    borderRadius: radius.sm, padding: spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
