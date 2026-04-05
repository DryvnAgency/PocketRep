import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Modal, ScrollView, Alert, ActivityIndicator,
  Animated, PanResponder, Dimensions, Linking, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, heatConfig } from '@/constants/theme';
import type { Contact, Stage } from '@/lib/types';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}
let ExpoContacts: any = null;
try { ExpoContacts = require('expo-contacts'); } catch {}
const MASS_TEXT_KEY = 'pocketrep_mass_text_v1';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 60;

const EMPTY_FORM = {
  first_name: '', last_name: '', phone: '', email: '', notes: '',
  vehicle_year: '', vehicle_make: '', vehicle_model: '',
  mileage: '', annual_mileage: '', lease_end_date: '', purchase_date: '',
  follow_up_date: '',
  stage: '' as Stage | '',
};

// ── CSV helpers ───────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      result.push(cur); cur = '';
    } else cur += c;
  }
  result.push(cur);
  return result;
}

const CSV_FIELD_MAP: Record<string, string> = {
  first_name: 'first_name', 'first name': 'first_name', firstname: 'first_name', first: 'first_name',
  last_name: 'last_name', 'last name': 'last_name', lastname: 'last_name', last: 'last_name',
  phone: 'phone', mobile: 'phone', cell: 'phone', 'cell phone': 'phone', 'phone number': 'phone',
  email: 'email',
  vehicle_year: 'vehicle_year', year: 'vehicle_year',
  vehicle_make: 'vehicle_make', make: 'vehicle_make',
  vehicle_model: 'vehicle_model', model: 'vehicle_model',
  mileage: 'mileage', 'current mileage': 'mileage',
  annual_mileage: 'annual_mileage', 'annual mileage': 'annual_mileage',
  lease_end_date: 'lease_end_date', 'lease end date': 'lease_end_date', 'lease end': 'lease_end_date', lease: 'lease_end_date',
  purchase_date: 'purchase_date', 'purchase date': 'purchase_date',
  follow_up_date: 'follow_up_date', 'follow up date': 'follow_up_date',
  stage: 'stage',
  notes: 'notes', note: 'notes',
};

function parseCsvText(text: string): any[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCsvLine(lines[i]);
    const row: any = {};
    headers.forEach((h, idx) => {
      const field = CSV_FIELD_MAP[h];
      if (field && vals[idx] !== undefined) row[field] = vals[idx].trim();
    });
    if (row.first_name) results.push(row);
  }
  return results;
}

// ── Avatar component ──────────────────────────────────────────────────────────
function Avatar({ first_name, last_name, size = 42 }: { first_name: string; last_name?: string; size?: number }) {
  const initials = `${first_name?.[0] ?? ''}${last_name?.[0] ?? ''}`.toUpperCase();
  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[av.text, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: {
    backgroundColor: colors.goldBg,
    borderWidth: 1.5,
    borderColor: colors.goldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.gold, fontWeight: '800' },
});

// ── FadeIn wrapper ────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useCallback(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 280,
      delay,
      useNativeDriver: true,
    }).start();
  }, [])();
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

// ── SwipeableRow ──────────────────────────────────────────────────────────────
function SwipeableRow({
  children, onEdit, onDelete,
}: {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const ACTION_WIDTH = 130;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 12,
      onPanResponderMove: (_, gs) => {
        const x = Math.max(-ACTION_WIDTH, Math.min(0, gs.dx + (open ? -ACTION_WIDTH : 0)));
        translateX.setValue(x);
      },
      onPanResponderRelease: (_, gs) => {
        const shouldOpen = gs.dx < -SWIPE_THRESHOLD;
        const shouldClose = gs.dx > SWIPE_THRESHOLD / 2;
        if (shouldOpen || (!shouldClose && open)) {
          Animated.spring(translateX, { toValue: -ACTION_WIDTH, useNativeDriver: true, tension: 60, friction: 10 }).start();
          setOpen(true);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
          setOpen(false);
        }
      },
    })
  ).current;

  function close() {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    setOpen(false);
  }

  return (
    <View style={sw.root}>
      {/* Action buttons revealed on swipe left */}
      <View style={[sw.actions, { width: ACTION_WIDTH }]}>
        <TouchableOpacity
          style={[sw.actionBtn, { backgroundColor: colors.gold }]}
          onPress={() => { close(); onEdit(); }}
          activeOpacity={0.8}
        >
          <Text style={sw.actionIcon}>✏️</Text>
          <Text style={sw.actionLabel}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sw.actionBtn, { backgroundColor: colors.red }]}
          onPress={() => { close(); onDelete(); }}
          activeOpacity={0.8}
        >
          <Text style={sw.actionIcon}>🗑</Text>
          <Text style={sw.actionLabel}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const sw = StyleSheet.create({
  root: { overflow: 'hidden', marginBottom: spacing.sm },
  actions: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4,
    borderRadius: radius.lg,
    marginLeft: 2,
  },
  actionIcon: { fontSize: 16 },
  actionLabel: { fontSize: 9, fontWeight: '700', color: colors.ink, letterSpacing: 0.3 },
});

const STAGES: { key: string; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '👥' },
  { key: 'prospect', label: 'Prospect', icon: '🎯' },
  { key: 'active', label: 'Active', icon: '🔄' },
  { key: 'sold', label: 'Sold', icon: '✅' },
  { key: 'dormant', label: 'Dormant', icon: '💤' },
  { key: 'lost', label: 'Lost', icon: '❌' },
];

const LEASE_FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All Leases' },
  { key: 'lt6', label: '< 6 mo' },
  { key: '6to12', label: '6–12 mo' },
  { key: '12to18', label: '12–18 mo' },
  { key: '18to24', label: '18–24 mo' },
];

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

function leaseMonthsAway(lease_end_date: string | null): number | null {
  if (!lease_end_date) return null;
  const end = parseLocalDate(lease_end_date);
  const now = new Date();
  return (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [leaseFilter, setLeaseFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMassText, setShowMassText] = useState(false);
  const [massTextMsg, setMassTextMsg] = useState('');
  const [massTextCount, setMassTextCount] = useState(0);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [userPlan, setUserPlan] = useState<string>('pro');
  const [showImport, setShowImport] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [selectedImport, setSelectedImport] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importFilter, setImportFilter] = useState<'all' | 'has_phone' | 'has_email'>('all');
  const [importSearch, setImportSearch] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  const PAGE_SIZE = 50;

  // Plan limits: Pro=50, Elite=100
  const MASS_TEXT_LIMIT = userPlan === 'elite' ? 100 : 50;

  async function load(reset = true) {
    if (reset) {
      pageRef.current = 0;
      setLoading(true);
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    userIdRef.current = user.id;

    const page = pageRef.current;
    const [{ data }, { data: prof }] = await Promise.all([
      supabase.from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('last_name', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      reset ? supabase.from('profiles').select('plan').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ]);

    const rows = data ?? [];
    setContacts(prev => reset ? rows : [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    if (prof) setUserPlan(prof.plan ?? 'pro');
    setLoading(false);
    setLoadingMore(false);
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    pageRef.current += 1;
    await load(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q)
    );
    const matchStage = stageFilter === 'all' || (c.stage ?? 'prospect') === stageFilter;
    const matchVehicle = !vehicleFilter || (c.vehicle_make ?? '').toLowerCase().includes(vehicleFilter.toLowerCase());
    const months = leaseMonthsAway(c.lease_end_date);
    const matchLease = leaseFilter === 'all' ? true
      : leaseFilter === 'lt6' ? (months !== null && months >= 0 && months < 6)
      : leaseFilter === '6to12' ? (months !== null && months >= 6 && months < 12)
      : leaseFilter === '12to18' ? (months !== null && months >= 12 && months < 18)
      : leaseFilter === '18to24' ? (months !== null && months >= 18 && months < 24)
      : true;
    return matchSearch && matchStage && matchVehicle && matchLease;
  });

  // Distinct vehicle makes for picker
  const vehicleMakes = Array.from(new Set(contacts.map(c => c.vehicle_make).filter(Boolean) as string[])).sort();

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
      follow_up_date: (c as any).follow_up_date ?? '',
      stage: (c as any).stage ?? '',
    });
    setShowModal(true);
  }

  function validateForm(): string | null {
    if (!form.first_name.trim()) return 'First name is required.';
    if (form.phone.trim() && !/^[\d\s\-\(\)\+\.]{7,20}$/.test(form.phone.trim())) return 'Phone number looks invalid.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Email address looks invalid.';
    if (form.vehicle_year.trim() && (isNaN(Number(form.vehicle_year)) || Number(form.vehicle_year) < 1900 || Number(form.vehicle_year) > new Date().getFullYear() + 2)) return 'Vehicle year looks invalid.';
    if (form.lease_end_date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.lease_end_date.trim())) return 'Lease End Date must be YYYY-MM-DD.';
    if (form.follow_up_date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.follow_up_date.trim())) return 'Follow-Up Date must be YYYY-MM-DD.';
    return null;
  }

  async function save() {
    const validErr = validateForm();
    if (validErr) { Alert.alert('Check your info', validErr); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const payload: any = {
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
      follow_up_date: form.follow_up_date.trim() || null,
    };
    if (form.stage) payload.stage = form.stage;

    if (editing) {
      // Preserve AI-generated fields that aren't in the manual edit form
      if ((editing as any).personal_events !== undefined) payload.personal_events = (editing as any).personal_events;
      if ((editing as any).buying_urgency !== undefined) payload.buying_urgency = (editing as any).buying_urgency;
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

  async function sendMassText() {
    if (!massTextMsg.trim()) { Alert.alert('Enter a message'); return; }
    const recipients = filtered.slice(0, MASS_TEXT_LIMIT).filter(c => c.phone);
    if (recipients.length === 0) { Alert.alert('No recipients with phone numbers.'); return; }
    const phones = recipients.map(c => c.phone).join(',');
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${phones}${sep}body=${encodeURIComponent(massTextMsg)}`;
    try { await Linking.openURL(smsUrl); } catch { Alert.alert('Could not open SMS app'); }
    const record = { id: Date.now().toString(), message: massTextMsg, recipient_count: recipients.length, sent_at: new Date().toISOString() };
    if (AsyncStorage) {
      try {
        const raw = await AsyncStorage.getItem(MASS_TEXT_KEY);
        const existing = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(MASS_TEXT_KEY, JSON.stringify([...existing, record]));
      } catch {}
    }
    setShowMassText(false);
    setMassTextMsg('');
  }

  async function requestPhoneImport() {
    if (!ExpoContacts) { Alert.alert('Not available', 'expo-contacts is not installed in this build.'); return; }
    try {
      const { status } = await ExpoContacts.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Allow contacts access in device settings.'); return; }
      const { data } = await ExpoContacts.getContactsAsync({
        fields: [ExpoContacts.Fields.Name, ExpoContacts.Fields.PhoneNumbers, ExpoContacts.Fields.Emails],
      });
      setDeviceContacts(data ?? []);
      setSelectedImport(new Set());
      setShowImport(true);
    } catch (e: any) { Alert.alert('Error', e?.message ?? 'Could not load contacts'); }
  }

  async function importSelected() {
    if (selectedImport.size === 0) { Alert.alert('Select at least one contact'); return; }
    setImporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setImporting(false); return; }
    const toInsert = deviceContacts
      .filter(dc => selectedImport.has(dc.id))
      .map(dc => {
        const parts = (dc.name ?? '').trim().split(' ');
        return { user_id: user.id, first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') || '', phone: dc.phoneNumbers?.[0]?.number ?? '', email: dc.emails?.[0]?.email ?? null, stage: 'prospect' };
      });
    try { await supabase.from('contacts').insert(toInsert); await load(); } catch { Alert.alert('Some contacts may not have imported'); }
    setImporting(false);
    setShowImport(false);
  }

  function handleCsvImport() {
    if (Platform.OS === 'web') {
      const input = (globalThis as any).document?.createElement('input');
      if (!input) return;
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const reader = new (globalThis as any).FileReader();
        reader.onload = (ev: any) => {
          const text = ev.target?.result as string;
          const parsed = parseCsvText(text);
          if (!parsed.length) {
            Alert.alert('No contacts found', 'Make sure your CSV has a header row with at least a "first_name" column.');
            return;
          }
          setCsvPreview(parsed);
          setShowCsvModal(true);
        };
        reader.readAsText(file);
      };
      input.click();
    } else {
      setCsvText('');
      setCsvPreview([]);
      setShowCsvModal(true);
    }
  }

  async function confirmCsvImport() {
    const rows = Platform.OS === 'web' ? csvPreview : parseCsvText(csvText);
    if (!rows.length) {
      Alert.alert('No valid contacts', 'Check that your CSV has a header row and a "first_name" column.');
      return;
    }
    setCsvImporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCsvImporting(false); return; }
    const payload = rows.map((row: any) => ({
      user_id: user.id,
      first_name: row.first_name ?? '',
      last_name: row.last_name ?? '',
      phone: row.phone ?? '',
      email: row.email ?? null,
      notes: row.notes ?? null,
      vehicle_year: row.vehicle_year ? parseInt(row.vehicle_year) || null : null,
      vehicle_make: row.vehicle_make ?? null,
      vehicle_model: row.vehicle_model ?? null,
      mileage: row.mileage ? parseInt(row.mileage) || null : null,
      annual_mileage: row.annual_mileage ? parseInt(row.annual_mileage) || null : null,
      lease_end_date: row.lease_end_date || null,
      purchase_date: row.purchase_date || null,
      follow_up_date: row.follow_up_date || null,
      stage: row.stage || 'prospect',
    }));
    try {
      await supabase.from('contacts').insert(payload);
      await load();
      Alert.alert('Import complete ✅', `${payload.length} contact${payload.length !== 1 ? 's' : ''} added to your book.`);
    } catch {
      Alert.alert('Import failed', 'Some contacts may not have imported. Check for duplicate phone numbers.');
    }
    setCsvImporting(false);
    setShowCsvModal(false);
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Your Book</Text>
        <View style={s.headerBtns}>
          <TouchableOpacity
            style={s.massBtn}
            onPress={() => {
              const count = Math.min(filtered.length, MASS_TEXT_LIMIT);
              setMassTextCount(count);
              setShowMassText(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={s.massBtnText}>📤 Mass Text</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
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

      {/* Import row */}
      <View style={s.importRow}>
        <TouchableOpacity style={s.importBtn} onPress={requestPhoneImport} activeOpacity={0.8}>
          <Text style={s.importBtnText}>📥 Import from Phone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.importBtn} onPress={handleCsvImport} activeOpacity={0.8}>
          <Text style={s.importBtnText}>📄 Import CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Stage filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stageRow} contentContainerStyle={s.stageRowInner}>
        {STAGES.map(st => (
          <TouchableOpacity
            key={st.key}
            style={[s.stagePill, stageFilter === st.key && s.stagePillActive]}
            onPress={() => setStageFilter(st.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.stagePillText, stageFilter === st.key && s.stagePillTextActive]}>
              {st.icon} {st.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lease expiry + vehicle filters */}
      <View style={s.smartFilterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.sm }}>
          {LEASE_FILTERS.map(lf => (
            <TouchableOpacity
              key={lf.key}
              style={[s.leaseFilterPill, leaseFilter === lf.key && s.leaseFilterPillActive]}
              onPress={() => setLeaseFilter(lf.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.leaseFilterText, leaseFilter === lf.key && s.leaseFilterTextActive]}>
                {lf.key !== 'all' ? '📅 ' : ''}{lf.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={[s.vehicleBtn, vehicleFilter ? s.vehicleBtnActive : undefined]}
          onPress={() => setShowVehiclePicker(true)}
          activeOpacity={0.8}
        >
          <Text style={[s.vehicleBtnText, vehicleFilter ? s.vehicleBtnTextActive : undefined]}>
            🚗 {vehicleFilter || 'Any vehicle'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Vehicle picker modal */}
      <Modal visible={showVehiclePicker} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.mHeader}>
              <Text style={m.mTitle}>Filter by Vehicle</Text>
              <TouchableOpacity onPress={() => setShowVehiclePicker(false)}><Text style={m.mClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView>
              <TouchableOpacity style={[s.vehicleRow, !vehicleFilter && s.vehicleRowActive]} onPress={() => { setVehicleFilter(''); setShowVehiclePicker(false); }}>
                <Text style={s.vehicleRowText}>All Vehicles</Text>
              </TouchableOpacity>
              {vehicleMakes.map(make => (
                <TouchableOpacity key={make} style={[s.vehicleRow, vehicleFilter === make && s.vehicleRowActive]} onPress={() => { setVehicleFilter(make); setShowVehiclePicker(false); }}>
                  <Text style={s.vehicleRowText}>{make}</Text>
                  {vehicleFilter === make && <Text style={{ color: colors.gold }}>✓</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          contentContainerStyle={filtered.length === 0 ? s.emptyList : { padding: spacing.lg, paddingBottom: 32 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>📖</Text>
              <Text style={s.emptyTitle}>{search ? 'No matches' : 'Empty book'}</Text>
              <Text style={s.emptySub}>
                {search ? 'Try a different search.' : 'Tap + Add to log your first customer.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.gold} style={{ marginVertical: 16 }} />
            ) : hasMore && !search ? (
              <TouchableOpacity style={s.loadMoreBtn} onPress={loadMore} activeOpacity={0.7}>
                <Text style={s.loadMoreText}>Load more contacts</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item: c, index }) => (
            <FadeIn delay={Math.min(index, 20) * 30}>
              <SwipeableRow onEdit={() => openEdit(c)} onDelete={() => deleteContact(c)}>
                <ContactRow contact={c} onPress={() => openEdit(c)} />
              </SwipeableRow>
            </FadeIn>
          )}
        />
      )}

      {/* Mass Text Modal */}
      <Modal visible={showMassText} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.mHeader}>
              <Text style={m.mTitle}>Mass Text</Text>
              <TouchableOpacity onPress={() => setShowMassText(false)}>
                <Text style={m.mClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={mt.sub}>
              Sending to{' '}
              <Text style={{ color: colors.gold }}>{massTextCount} contact{massTextCount !== 1 ? 's' : ''}</Text>
              {stageFilter !== 'all' ? ` in ${stageFilter}` : ''}
              {' '}· <Text style={{ color: colors.grey2 }}>{userPlan === 'elite' ? 'Elite' : 'Pro'} limit: {MASS_TEXT_LIMIT}</Text>
            </Text>
            <Text style={m.label}>Message</Text>
            <TextInput
              style={[m.input, { height: 120, textAlignVertical: 'top' }]}
              value={massTextMsg}
              onChangeText={setMassTextMsg}
              placeholder={`Hey {{first_name}}, …`}
              placeholderTextColor={colors.grey}
              multiline
            />
            <Text style={mt.tip}>Use {'{{first_name}}'} to personalize each message.</Text>
            <TouchableOpacity
              style={[m.saveBtn, !massTextMsg.trim() && { opacity: 0.4 }]}
              disabled={!massTextMsg.trim()}
              onPress={sendMassText}
              activeOpacity={0.85}
            >
              <Text style={m.saveBtnText}>Send to {massTextCount} contacts →</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </View>
      </Modal>

      {/* Phone Import Modal */}
      <Modal visible={showImport} animationType="slide">
        <View style={imp.root}>
          <View style={imp.header}>
            <Text style={imp.title}>Import from Phone</Text>
            <TouchableOpacity onPress={() => setShowImport(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={imp.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={imp.sub}>{selectedImport.size} selected · Added as Prospect</Text>

          {/* Filter pills */}
          <View style={imp.filterRow}>
            {(['all', 'has_phone', 'has_email'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[imp.filterPill, importFilter === f && imp.filterPillActive]}
                onPress={() => setImportFilter(f)}
                activeOpacity={0.8}
              >
                <Text style={[imp.filterPillText, importFilter === f && imp.filterPillTextActive]}>
                  {f === 'all' ? 'All' : f === 'has_phone' ? '📞 Has Phone' : '✉️ Has Email'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search bar */}
          <TextInput
            style={imp.searchInput}
            value={importSearch}
            onChangeText={setImportSearch}
            placeholder="Search contacts…"
            placeholderTextColor="#666"
          />

          <FlatList
            data={deviceContacts.filter(dc => {
              const matchFilter = importFilter === 'all' ? true
                : importFilter === 'has_phone' ? !!dc.phoneNumbers?.length
                : !!dc.emails?.length;
              const matchSearch = !importSearch || dc.name?.toLowerCase().includes(importSearch.toLowerCase());
              return matchFilter && matchSearch;
            })}
            keyExtractor={dc => dc.id}
            contentContainerStyle={{ padding: spacing.lg }}
            renderItem={({ item: dc }) => {
              const selected = selectedImport.has(dc.id);
              return (
                <TouchableOpacity
                  style={[imp.row, selected && imp.rowSelected]}
                  onPress={() => setSelectedImport(prev => { const n = new Set(prev); n.has(dc.id) ? n.delete(dc.id) : n.add(dc.id); return n; })}
                >
                  <View style={[imp.check, selected && imp.checkSelected]}>
                    {selected && <Text style={imp.checkMark}>✓</Text>}
                  </View>
                  <View>
                    <Text style={imp.rowName}>{dc.name}</Text>
                    <Text style={imp.rowPhone}>{dc.phoneNumbers?.[0]?.number ?? 'No phone'}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          <View style={imp.footer}>
            <TouchableOpacity style={imp.importBtn} onPress={importSelected} disabled={importing}>
              {importing ? <ActivityIndicator color={colors.ink} /> : <Text style={imp.importBtnText}>Import {selectedImport.size} Contacts</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CSV Import Modal */}
      <Modal visible={showCsvModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <View style={m.mHeader}>
              <Text style={m.mTitle}>Import CSV</Text>
              <TouchableOpacity onPress={() => setShowCsvModal(false)}><Text style={m.mClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {Platform.OS === 'web' ? (
                /* Web: file already loaded — show preview */
                <>
                  <Text style={csv.previewLabel}>
                    {csvPreview.length} contact{csvPreview.length !== 1 ? 's' : ''} found in file
                  </Text>
                  {csvPreview.slice(0, 5).map((row, i) => (
                    <View key={i} style={csv.previewRow}>
                      <Text style={csv.previewName}>{row.first_name} {row.last_name}</Text>
                      <Text style={csv.previewSub}>{row.phone || row.email || 'No contact info'}</Text>
                    </View>
                  ))}
                  {csvPreview.length > 5 && <Text style={csv.more}>+{csvPreview.length - 5} more…</Text>}
                </>
              ) : (
                /* Native: paste CSV */
                <>
                  <Text style={csv.hint}>
                    Paste CSV content below. First row must be headers.{'\n'}
                    Supported: first_name, last_name, phone, email, vehicle_year, vehicle_make, vehicle_model, mileage, lease_end_date, stage, notes
                  </Text>
                  <TextInput
                    style={csv.pasteInput}
                    value={csvText}
                    onChangeText={t => { setCsvText(t); setCsvPreview(parseCsvText(t)); }}
                    placeholder={'first_name,last_name,phone\nMarcus,Webb,555-1234\nSarah,Jones,555-5678'}
                    placeholderTextColor={colors.grey}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {csvPreview.length > 0 && (
                    <Text style={csv.previewLabel}>{csvPreview.length} contact{csvPreview.length !== 1 ? 's' : ''} detected</Text>
                  )}
                </>
              )}
              <TouchableOpacity
                style={[m.saveBtn, (!csvPreview.length && Platform.OS === 'web') && { opacity: 0.4 }]}
                onPress={confirmCsvImport}
                disabled={csvImporting || (Platform.OS === 'web' && !csvPreview.length)}
                activeOpacity={0.85}
              >
                {csvImporting
                  ? <ActivityIndicator color={colors.ink} />
                  : <Text style={m.saveBtnText}>
                      Import {Platform.OS === 'web' ? csvPreview.length : csvPreview.length || '…'} contacts →
                    </Text>
                }
              </TouchableOpacity>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
              <Field label="First Name *" value={form.first_name} onChangeText={(v: string) => setForm(f => ({ ...f, first_name: v }))} placeholder="Marcus" />
              <Field label="Last Name" value={form.last_name} onChangeText={(v: string) => setForm(f => ({ ...f, last_name: v }))} placeholder="Webb" />
              <Field label="Phone" value={form.phone} onChangeText={(v: string) => setForm(f => ({ ...f, phone: v }))} placeholder="555-867-5309" keyboardType="phone-pad" />
              <Field label="Email" value={form.email} onChangeText={(v: string) => setForm(f => ({ ...f, email: v }))} placeholder="marcus@email.com" keyboardType="email-address" autoCapitalize="none" />

              <Text style={m.section}>Stage</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
                  {STAGES.filter(st => st.key !== 'all').map(st => (
                    <TouchableOpacity
                      key={st.key}
                      style={[s.stagePill, form.stage === st.key && s.stagePillActive]}
                      onPress={() => setForm(f => ({ ...f, stage: f.stage === st.key ? '' : st.key as Stage }))}
                    >
                      <Text style={[s.stagePillText, form.stage === st.key && s.stagePillTextActive]}>
                        {st.icon} {st.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={m.section}>Vehicle</Text>
              <Field label="Year" value={form.vehicle_year} onChangeText={(v: string) => setForm(f => ({ ...f, vehicle_year: v }))} placeholder="2021" keyboardType="numeric" />
              <Field label="Make" value={form.vehicle_make} onChangeText={(v: string) => setForm(f => ({ ...f, vehicle_make: v }))} placeholder="Honda" />
              <Field label="Model" value={form.vehicle_model} onChangeText={(v: string) => setForm(f => ({ ...f, vehicle_model: v }))} placeholder="Pilot" />
              <Field label="Current Mileage" value={form.mileage} onChangeText={(v: string) => setForm(f => ({ ...f, mileage: v }))} placeholder="38000" keyboardType="numeric" />
              <Field label="Annual Mileage" value={form.annual_mileage} onChangeText={(v: string) => setForm(f => ({ ...f, annual_mileage: v }))} placeholder="18000" keyboardType="numeric" />
              <Field label="Purchase Date (YYYY-MM-DD)" value={form.purchase_date} onChangeText={(v: string) => setForm(f => ({ ...f, purchase_date: v }))} placeholder="2021-04-15" />
              <Field label="Lease End Date (YYYY-MM-DD)" value={form.lease_end_date} onChangeText={(v: string) => setForm(f => ({ ...f, lease_end_date: v }))} placeholder="2024-04-15" />
              <Field label="Follow-Up Date (YYYY-MM-DD)" value={form.follow_up_date} onChangeText={(v: string) => setForm(f => ({ ...f, follow_up_date: v }))} placeholder="2024-05-01" />

              <Text style={m.section}>Notes</Text>
              <TextInput
                style={[m.input, { height: 80, textAlignVertical: 'top' }]}
                value={form.notes}
                onChangeText={(v: string) => setForm(f => ({ ...f, notes: v }))}
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

const STAGE_COLORS: Record<Stage, { color: string; bg: string; border: string }> = {
  prospect: { color: colors.gold, bg: colors.goldBg, border: colors.goldBorder },
  active: { color: colors.green, bg: colors.greenBg, border: colors.greenBorder },
  sold: { color: '#7c9fff', bg: 'rgba(124,159,255,0.10)', border: 'rgba(124,159,255,0.25)' },
  dormant: { color: colors.grey2, bg: 'rgba(138,144,160,0.10)', border: 'rgba(138,144,160,0.22)' },
  lost: { color: colors.red, bg: colors.redBg, border: colors.redBorder },
};

// ── Contact row ───────────────────────────────────────────────────────────────
function ContactRow({ contact: c, onPress }: { contact: Contact; onPress: () => void }) {
  const vehicle = [c.vehicle_year, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ');
  const cfg = c.heat_tier ? heatConfig[c.heat_tier] : null;
  const stage = (c as any).stage as Stage | undefined;
  const stageCfg = stage ? STAGE_COLORS[stage] : null;

  return (
    <TouchableOpacity style={r.card} onPress={onPress} activeOpacity={0.88}>
      <View style={r.left}>
        <Avatar first_name={c.first_name} last_name={c.last_name} size={42} />
        <View style={r.info}>
          <Text style={r.name}>{c.first_name} {c.last_name}</Text>
          {vehicle ? <Text style={r.vehicle}>{vehicle}</Text> : null}
          {c.phone ? <Text style={r.phone}>{c.phone}</Text> : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {cfg ? (
          <View style={[r.tierPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[r.tierText, { color: cfg.color }]}>{cfg.icon} {cfg.label}</Text>
          </View>
        ) : null}
        {stageCfg ? (
          <View style={[r.tierPill, { backgroundColor: stageCfg.bg, borderColor: stageCfg.border }]}>
            <Text style={[r.tierText, { color: stageCfg.color }]}>{stage}</Text>
          </View>
        ) : null}
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
  headerBtns: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  massBtn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2,
  },
  massBtnText: { color: colors.grey2, fontWeight: '600', fontSize: 12 },
  addBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  addBtnText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  searchWrap: { padding: spacing.lg, paddingBottom: spacing.sm },
  search: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.md, color: colors.white, fontSize: 14,
  },
  importRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs, flexDirection: 'row', gap: spacing.xs },
  importBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  importBtnText: { fontSize: 11, color: colors.grey3, fontWeight: '600' },
  stageRow: { flexGrow: 0 },
  stageRowInner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  stagePill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  stagePillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  stagePillText: { color: colors.grey2, fontSize: 12, fontWeight: '600' },
  stagePillTextActive: { color: colors.gold },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptySub: { color: colors.grey2, fontSize: 13, textAlign: 'center' },
  loadMoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
  loadMoreText: { color: colors.grey2, fontSize: 13, fontWeight: '600' },
  // Smart filters
  smartFilterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs,
  },
  leaseFilterPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 4,
  },
  leaseFilterPillActive: { backgroundColor: 'rgba(66,184,131,0.12)', borderColor: 'rgba(66,184,131,0.4)' },
  leaseFilterText: { color: colors.grey2, fontSize: 11, fontWeight: '600' },
  leaseFilterTextActive: { color: colors.green },
  vehicleBtn: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 4,
    flexShrink: 0,
  },
  vehicleBtnActive: { backgroundColor: 'rgba(224,140,82,0.12)', borderColor: 'rgba(224,140,82,0.4)' },
  vehicleBtnText: { color: colors.grey2, fontSize: 11, fontWeight: '600' },
  vehicleBtnTextActive: { color: colors.orange },
  vehicleRow: {
    padding: spacing.md, borderRadius: radius.sm,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  vehicleRowActive: { backgroundColor: colors.goldBg },
  vehicleRowText: { color: colors.grey3, fontSize: 14 },
});

const mt = StyleSheet.create({
  sub: { color: colors.grey2, fontSize: 13, marginBottom: spacing.md },
  tip: { color: colors.grey, fontSize: 11, marginTop: 4, marginBottom: spacing.sm },
});

const r = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.ink4,
    padding: spacing.md,
    gap: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: colors.white },
  vehicle: { fontSize: 11, color: colors.grey2, marginTop: 1 },
  phone: { fontSize: 11, color: colors.grey, marginTop: 1 },
  tierPill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tierText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    backgroundColor: colors.ink2, borderTopLeftRadius: 22, borderTopRightRadius: 22,
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
    borderRadius: radius.lg, padding: spacing.sm + 2, color: colors.white, fontSize: 14,
  },
  saveBtn: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  saveBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

const imp = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md,
    backgroundColor: colors.ink2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.white },
  close: { color: colors.grey2, fontSize: 22 },
  sub: { fontSize: 12, color: colors.grey2, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.ink4,
  },
  rowSelected: { borderColor: colors.goldBorder, backgroundColor: colors.goldBg },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.white },
  rowPhone: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.ink4, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkMark: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', backgroundColor: colors.ink2 },
  importBtn: { backgroundColor: colors.gold, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  importBtnText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  // Filter pills + search
  filterRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  filterPill: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  filterPillActive: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  filterPillText: { color: colors.grey2, fontSize: 11, fontWeight: '600' },
  filterPillTextActive: { color: colors.gold },
  searchInput: {
    marginHorizontal: spacing.lg, marginBottom: spacing.xs,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8,
    color: colors.white, fontSize: 13,
  },
});

const csv = StyleSheet.create({
  hint: {
    color: colors.grey2, fontSize: 12, lineHeight: 18,
    marginBottom: spacing.md, backgroundColor: colors.ink3,
    borderRadius: radius.sm, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.ink4,
  },
  pasteInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink4,
    borderRadius: radius.lg, padding: spacing.sm + 2,
    color: colors.white, fontSize: 12, height: 160,
    textAlignVertical: 'top', fontFamily: 'monospace',
  },
  previewLabel: {
    fontSize: 13, fontWeight: '700', color: colors.green,
    marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  previewRow: {
    backgroundColor: colors.surface2, borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: 4,
    borderWidth: 1, borderColor: colors.ink4,
  },
  previewName: { color: colors.white, fontWeight: '600', fontSize: 13 },
  previewSub: { color: colors.grey2, fontSize: 11, marginTop: 2 },
  more: { color: colors.grey, fontSize: 11, marginBottom: spacing.sm },
});
