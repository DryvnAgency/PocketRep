import { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ScrollView, Alert, ActivityIndicator,
  Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/constants/theme';
import type { Deal, Contact } from '@/lib/types';

const EMPTY_FORM = {
  title: '',
  contact_id: null as string | null,
  amount: '',
  front_gross: '',
  back_gross: '',
  closed_at: '',
  notes: '',
};

// ── FadeIn ────────────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useCallback(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }).start();
  }, [])();
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

function currency(n: number | null) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
}

export default function DealsScreen() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: d }, { data: c }] = await Promise.all([
      supabase.from('deals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('contacts').select('id,first_name,last_name').eq('user_id', user.id).order('last_name'),
    ]);

    setDeals(d ?? []);
    setContacts((c ?? []) as Contact[]);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // Summary stats
  const totalFront = deals.reduce((s, d) => s + (d.front_gross ?? 0), 0);
  const totalBack = deals.reduce((s, d) => s + (d.back_gross ?? 0), 0);
  const totalDeals = deals.length;

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(d: Deal) {
    setEditing(d);
    setForm({
      title: d.title,
      contact_id: d.contact_id,
      amount: d.amount?.toString() ?? '',
      front_gross: d.front_gross?.toString() ?? '',
      back_gross: d.back_gross?.toString() ?? '',
      closed_at: d.closed_at ?? '',
      notes: d.notes ?? '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.title.trim()) { Alert.alert('Deal name is required'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      contact_id: form.contact_id || null,
      amount: form.amount ? parseFloat(form.amount) : null,
      front_gross: form.front_gross ? parseFloat(form.front_gross) : null,
      back_gross: form.back_gross ? parseFloat(form.back_gross) : null,
      closed_at: form.closed_at.trim() || null,
      notes: form.notes.trim() || null,
    };

    if (editing) {
      await supabase.from('deals').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('deals').insert(payload);
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  async function deleteDeal(d: Deal) {
    Alert.alert('Delete deal', `Remove "${d.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('deals').delete().eq('id', d.id);
          load();
        },
      },
    ]);
  }

  const selectedContact = contacts.find(c => c.id === form.contact_id);
  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase();
    return `${c.first_name} ${c.last_name}`.toLowerCase().includes(q);
  });

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Deals</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Text style={s.addBtnText}>+ Log Deal</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{totalDeals}</Text>
          <Text style={s.statLabel}>Deals</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{currency(totalFront)}</Text>
          <Text style={s.statLabel}>Front Gross</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{currency(totalBack)}</Text>
          <Text style={s.statLabel}>Back Gross</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={[s.statValue, { color: colors.gold }]}>{currency(totalFront + totalBack)}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={deals}
          keyExtractor={d => d.id}
          contentContainerStyle={deals.length === 0 ? s.emptyList : { padding: spacing.lg, paddingBottom: 32 }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>💰</Text>
              <Text style={s.emptyTitle}>No deals logged</Text>
              <Text style={s.emptySub}>Tap + Log Deal to track your first deal.</Text>
            </View>
          }
          renderItem={({ item: d, index }) => (
            <FadeIn delay={index * 25}>
              <DealCard deal={d} contacts={contacts} onEdit={() => openEdit(d)} onDelete={() => deleteDeal(d)} />
            </FadeIn>
          )}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.mHeader}>
              <Text style={m.mTitle}>{editing ? 'Edit Deal' : 'Log a Deal'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={m.mClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={m.scroll} keyboardShouldPersistTaps="handled">
              <MField label="Deal Name *" value={form.title} onChangeText={(v: string) => setForm(f => ({ ...f, title: v }))} placeholder="2024 F-150 — Marcus Webb" />

              {/* Contact picker */}
              <Text style={m.label}>Customer</Text>
              <TouchableOpacity
                style={m.contactPickerBtn}
                onPress={() => { setContactSearch(''); setShowContactPicker(true); }}
                activeOpacity={0.8}
              >
                <Text style={[m.contactPickerText, selectedContact ? { color: colors.white } : {}]}>
                  {selectedContact ? `${selectedContact.first_name} ${selectedContact.last_name}` : 'Select customer (optional)'}
                </Text>
                <Text style={{ color: colors.grey2, fontSize: 12 }}>▼</Text>
              </TouchableOpacity>

              <Text style={m.sectionLabel}>Gross</Text>
              <View style={m.grossRow}>
                <View style={{ flex: 1 }}>
                  <Text style={m.label}>Front</Text>
                  <TextInput
                    style={m.input}
                    value={form.front_gross}
                    onChangeText={(v: string) => setForm(f => ({ ...f, front_gross: v }))}
                    placeholder="1200"
                    placeholderTextColor={colors.grey}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={m.label}>Back</Text>
                  <TextInput
                    style={m.input}
                    value={form.back_gross}
                    onChangeText={(v: string) => setForm(f => ({ ...f, back_gross: v }))}
                    placeholder="800"
                    placeholderTextColor={colors.grey}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <MField label="Sale Amount" value={form.amount} onChangeText={(v: string) => setForm(f => ({ ...f, amount: v }))} placeholder="34500" keyboardType="decimal-pad" />
              <MField label="Close Date (YYYY-MM-DD)" value={form.closed_at} onChangeText={(v: string) => setForm(f => ({ ...f, closed_at: v }))} placeholder="2026-04-01" />

              <Text style={m.label}>Notes</Text>
              <TextInput
                style={[m.input, { height: 72, textAlignVertical: 'top' }]}
                value={form.notes}
                onChangeText={(v: string) => setForm(f => ({ ...f, notes: v }))}
                placeholder="Trade-in, F&I products, anything noteworthy…"
                placeholderTextColor={colors.grey}
                multiline
              />

              <TouchableOpacity style={m.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={m.saveBtnText}>{editing ? 'Save Changes' : 'Log Deal'}</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Contact picker sheet */}
      <Modal visible={showContactPicker} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={[m.sheet, { maxHeight: '70%' }]}>
            <View style={m.handle} />
            <Text style={m.mTitle}>Select Customer</Text>
            <TextInput
              style={[m.input, { marginTop: spacing.sm, marginBottom: spacing.sm }]}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Search…"
              placeholderTextColor={colors.grey}
              autoFocus
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[cp.row, !form.contact_id && cp.rowActive]}
                onPress={() => { setForm(f => ({ ...f, contact_id: null })); setShowContactPicker(false); }}
              >
                <Text style={cp.rowText}>None</Text>
              </TouchableOpacity>
              {filteredContacts.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[cp.row, form.contact_id === c.id && cp.rowActive]}
                  onPress={() => { setForm(f => ({ ...f, contact_id: c.id })); setShowContactPicker(false); }}
                >
                  <Text style={cp.rowText}>{c.first_name} {c.last_name}</Text>
                  {form.contact_id === c.id && <Text style={{ color: colors.gold }}>✓</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────
function DealCard({ deal: d, contacts, onEdit, onDelete }: {
  deal: Deal; contacts: Contact[];
  onEdit: () => void; onDelete: () => void;
}) {
  const contact = contacts.find(c => c.id === d.contact_id);
  const total = (d.front_gross ?? 0) + (d.back_gross ?? 0);

  return (
    <TouchableOpacity style={dc.card} onPress={onEdit} activeOpacity={0.85}>
      <View style={dc.top}>
        <View style={dc.titleWrap}>
          <Text style={dc.title} numberOfLines={1}>{d.title}</Text>
          {contact ? (
            <Text style={dc.customer}>{contact.first_name} {contact.last_name}</Text>
          ) : null}
        </View>
        <View style={dc.grossBadge}>
          <Text style={dc.grossText}>{currency(total)}</Text>
        </View>
      </View>

      <View style={dc.row}>
        {d.front_gross != null && (
          <View style={dc.chip}>
            <Text style={dc.chipLabel}>Front</Text>
            <Text style={dc.chipVal}>{currency(d.front_gross)}</Text>
          </View>
        )}
        {d.back_gross != null && (
          <View style={dc.chip}>
            <Text style={dc.chipLabel}>Back</Text>
            <Text style={dc.chipVal}>{currency(d.back_gross)}</Text>
          </View>
        )}
        {d.amount != null && (
          <View style={dc.chip}>
            <Text style={dc.chipLabel}>Sale</Text>
            <Text style={dc.chipVal}>{currency(d.amount)}</Text>
          </View>
        )}
      </View>

      <View style={dc.footer}>
        <Text style={dc.date}>
          {d.closed_at
            ? `Closed ${new Date(d.closed_at).toLocaleDateString()}`
            : `Logged ${new Date(d.created_at).toLocaleDateString()}`}
        </Text>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={dc.del}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function MField({ label, value, onChangeText, placeholder, keyboardType }: any) {
  return (
    <>
      <Text style={m.label}>{label}</Text>
      <TextInput
        style={m.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.grey}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="words"
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  addBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  addBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  statsBar: {
    flexDirection: 'row', backgroundColor: colors.ink3,
    borderBottomWidth: 1, borderBottomColor: colors.ink4,
    paddingVertical: spacing.md,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.white },
  statLabel: { fontSize: 9, fontWeight: '600', color: colors.grey2, letterSpacing: 0.4, textTransform: 'uppercase' },
  statDivider: { width: 1, backgroundColor: colors.ink4 },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center' },
});

const dc = StyleSheet.create({
  card: {
    backgroundColor: colors.surface2,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md, marginBottom: spacing.sm, gap: 8,
    borderLeftWidth: 3, borderLeftColor: colors.gold,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleWrap: { flex: 1, marginRight: spacing.sm },
  title: { fontSize: 14, fontWeight: '700', color: colors.white },
  customer: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  grossBadge: {
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },
  grossText: { color: colors.gold, fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    backgroundColor: colors.ink3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.ink4,
    paddingHorizontal: spacing.sm, paddingVertical: 3, flexDirection: 'row', gap: 5, alignItems: 'center',
  },
  chipLabel: { fontSize: 9, fontWeight: '600', color: colors.grey, textTransform: 'uppercase', letterSpacing: 0.3 },
  chipVal: { fontSize: 11, fontWeight: '700', color: colors.grey3 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: 10, color: colors.grey, fontWeight: '500' },
  del: { color: colors.grey, fontSize: 13, paddingLeft: 12 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    padding: spacing.lg, maxHeight: '92%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  mHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  mTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  mClose: { color: colors.grey2, fontSize: 18 },
  scroll: { flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  label: { fontSize: 11, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.sm + 2, color: colors.white, fontSize: 14,
  },
  grossRow: { flexDirection: 'row', gap: spacing.sm },
  contactPickerBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.sm + 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  contactPickerText: { color: colors.grey, fontSize: 14 },
  saveBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

const cp = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderRadius: radius.sm, marginBottom: 2,
  },
  rowActive: { backgroundColor: colors.goldBg },
  rowText: { color: colors.grey3, fontSize: 14 },
});
