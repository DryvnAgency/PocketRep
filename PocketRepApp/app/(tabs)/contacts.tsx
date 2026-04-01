import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, heatConfig } from '@/constants/theme';
import type { Contact } from '@/lib/types';

const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', email: '', notes: '',
  vehicle_year: '', vehicle_make: '', vehicle_model: '',
  mileage: '', annual_mileage: '', lease_end_date: '', purchase_date: '',
};

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('last_name', { ascending: true });
    setContacts(data ?? []);
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  });

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({
      first_name: c.first_name,
      last_name: c.last_name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      notes: c.notes ?? '',
      vehicle_year: c.vehicle_year?.toString() ?? '',
      vehicle_make: c.vehicle_make ?? '',
      vehicle_model: c.vehicle_model ?? '',
      mileage: c.mileage?.toString() ?? '',
      annual_mileage: c.annual_mileage?.toString() ?? '',
      lease_end_date: c.lease_end_date ?? '',
      purchase_date: c.purchase_date ?? '',
    });
    setShowModal(true);
  }

  async function save() {
    if (!form.first_name.trim()) { Alert.alert('First name is required'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload = {
      user_id: user.id,
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
      vehicle_make: form.vehicle_make.trim() || null,
      vehicle_model: form.vehicle_model.trim() || null,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      annual_mileage: form.annual_mileage ? parseInt(form.annual_mileage) : null,
      lease_end_date: form.lease_end_date.trim() || null,
      purchase_date: form.purchase_date.trim() || null,
    };

    if (editing) {
      await supabase.from('contacts').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('contacts').insert(payload);
    }

    setSaving(false);
    setShowModal(false);
    load();
  }

  async function deleteContact(c: Contact) {
    Alert.alert('Delete contact', `Remove ${c.first_name} ${c.last_name} from your book?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('contacts').delete().eq('id', c.id);
          load();
        },
      },
    ]);
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Your Book</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or number…"
          placeholderTextColor={colors.grey}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          contentContainerStyle={filtered.length === 0 ? s.emptyList : { padding: spacing.lg }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📖</Text>
              <Text style={s.emptyTitle}>{search ? 'No matches' : 'Empty book'}</Text>
              <Text style={s.emptySub}>
                {search ? 'Try a different search.' : 'Tap + Add to log your first customer.'}
              </Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <ContactRow contact={c} onEdit={() => openEdit(c)} onDelete={() => deleteContact(c)} />
          )}
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.mHeader}>
              <Text style={m.mTitle}>{editing ? 'Edit Contact' : 'Add Contact'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={m.mClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={m.scroll} keyboardShouldPersistTaps="handled">
              <Field label="First Name *" value={form.first_name} onChangeText={v => setForm(f => ({ ...f, first_name: v }))} placeholder="Marcus" />
              <Field label="Last Name" value={form.last_name} onChangeText={v => setForm(f => ({ ...f, last_name: v }))} placeholder="Webb" />
              <Field label="Phone" value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="555-867-5309" keyboardType="phone-pad" />
              <Field label="Email" value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="marcus@email.com" keyboardType="email-address" autoCapitalize="none" />

              <Text style={m.section}>Vehicle</Text>
              <Field label="Year" value={form.vehicle_year} onChangeText={v => setForm(f => ({ ...f, vehicle_year: v }))} placeholder="2021" keyboardType="numeric" />
              <Field label="Make" value={form.vehicle_make} onChangeText={v => setForm(f => ({ ...f, vehicle_make: v }))} placeholder="Honda" />
              <Field label="Model" value={form.vehicle_model} onChangeText={v => setForm(f => ({ ...f, vehicle_model: v }))} placeholder="Pilot" />
              <Field label="Current Mileage" value={form.mileage} onChangeText={v => setForm(f => ({ ...f, mileage: v }))} placeholder="38000" keyboardType="numeric" />
              <Field label="Annual Mileage" value={form.annual_mileage} onChangeText={v => setForm(f => ({ ...f, annual_mileage: v }))} placeholder="18000" keyboardType="numeric" />
              <Field label="Purchase Date (YYYY-MM-DD)" value={form.purchase_date} onChangeText={v => setForm(f => ({ ...f, purchase_date: v }))} placeholder="2021-04-15" />
              <Field label="Lease End Date (YYYY-MM-DD)" value={form.lease_end_date} onChangeText={v => setForm(f => ({ ...f, lease_end_date: v }))} placeholder="2024-04-15" />

              <Text style={m.section}>Notes</Text>
              <TextInput
                style={[m.input, { height: 80, textAlignVertical: 'top' }]}
                value={form.notes}
                onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                placeholder="Kids' names, what almost killed last deal, preferred color…"
                placeholderTextColor={colors.grey}
                multiline
              />

              <TouchableOpacity style={m.saveBtn} onPress={save} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.ink} /> : <Text style={m.saveBtnText}>{editing ? 'Save Changes' : 'Add to Book'}</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Contact row ───────────────────────────────────────────────────────────────
function ContactRow({ contact: c, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  const vehicle = [c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ');
  const cfg = c.heat_tier ? heatConfig[c.heat_tier] : null;

  return (
    <TouchableOpacity style={r.card} onPress={onEdit} activeOpacity={0.8}>
      <View style={r.left}>
        <View style={r.avatar}>
          <Text style={r.avatarText}>{c.first_name[0]}{c.last_name?.[0] ?? ''}</Text>
        </View>
        <View>
          <Text style={r.name}>{c.first_name} {c.last_name}</Text>
          {vehicle ? <Text style={r.vehicle}>{vehicle}</Text> : null}
          {c.phone ? <Text style={r.phone}>{c.phone}</Text> : null}
        </View>
      </View>
      <View style={r.right}>
        {cfg ? (
          <View style={[r.tierPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[r.tierText, { color: cfg.color }]}>{cfg.icon} {cfg.label}</Text>
          </View>
        ) : null}
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={r.del}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
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
        autoCapitalize={autoCapitalize ?? 'words'}
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
    backgroundColor: colors.gold, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  addBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  searchWrap: { padding: spacing.lg, paddingBottom: spacing.sm },
  search: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.md, color: colors.white, fontSize: 14,
  },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center' },
});

const r = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.ink4, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  vehicle: { fontSize: 11, color: colors.grey2, marginTop: 1 },
  phone: { fontSize: 11, color: colors.grey, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 6 },
  tierPill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tierText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  del: { color: colors.grey, fontSize: 14, paddingLeft: 8 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg, maxHeight: '92%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.ink4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  mHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  mTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  mClose: { color: colors.grey2, fontSize: 18 },
  scroll: { flex: 1 },
  section: { fontSize: 11, fontWeight: '700', color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.xs },
  label: { fontSize: 11, fontWeight: '600', color: colors.grey3, letterSpacing: 0.4, textTransform: 'uppercase', marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, padding: spacing.sm + 2, color: colors.white, fontSize: 14,
  },
  saveBtn: {
    backgroundColor: colors.gold, borderRadius: radius.sm,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});
