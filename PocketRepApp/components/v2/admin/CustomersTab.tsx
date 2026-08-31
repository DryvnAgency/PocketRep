// Owner Control Center — Customers tab
// Searchable/filterable customer list with inline 360 detail.

import { useEffect, useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '@/constants/theme';
import { KpiCard, KpiRow, StatusPill, SectionHeader, ListRow, LoadingState, ErrorState } from './atoms';
import { fetchUsers, fetchCustomerDetail, cents } from '@/lib/v2/admin/adminData';
import type { AdminUser, CustomerDetail } from '@/lib/v2/admin/adminTypes';

type Filter = 'all' | 'active' | 'trialing' | 'canceled' | 'past_due';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'Active' },
  { id: 'trialing',  label: 'Trialing' },
  { id: 'canceled',  label: 'Canceled' },
  { id: 'past_due',  label: 'Past Due' },
];

function CustomerDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerDetail(userId)
      .then(setDetail)
      .catch(e => setError(String(e)));
  }, [userId]);

  if (error) return <Text style={st.detailError}>{error}</Text>;
  if (!detail) return <Text style={st.detailLoading}>Loading…</Text>;

  const p = detail.profile;

  return (
    <View style={st.detailCard}>
      <Text style={st.detailSection}>PROFILE</Text>
      <Row label="Email" value={p.email} />
      <Row label="Plan" value={p.plan} />
      <Row label="Status" value={p.subscription_status} />
      {p.trial_ends_at ? <Row label="Trial ends" value={new Date(p.trial_ends_at).toLocaleDateString()} /> : null}
      <Row label="Joined" value={new Date(p.created_at).toLocaleDateString()} />

      <Text style={st.detailSection}>USAGE</Text>
      <Row label="Contacts" value={String(detail.contactCount)} />
      <Row label="Deals" value={`${detail.dealCount} (${cents(detail.dealGross * 100)} gross)`} />
      <Row label="Sequences" value={String(detail.sequenceCount)} />
      <Row label="Interactions" value={String(detail.interactionCount)} />
      <Row label="Nurture sent" value={String(detail.nurtureSent)} />
      <Row label="SMS sent" value={String(detail.smsCount)} />

      <Text style={st.detailSection}>AI</Text>
      <Row label="Total cost" value={cents(detail.aiCost)} />
      <Row label="Total requests" value={String(detail.aiRequests)} />

      <Text style={st.detailSection}>SUPPORT</Text>
      <Row label="Open tickets" value={String(detail.openTickets)} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.detailRow}>
      <Text style={st.detailLabel}>{label}</Text>
      <Text style={st.detailValue}>{value}</Text>
    </View>
  );
}

export default function CustomersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setError(null);
    fetchUsers().then(setUsers).catch(e => setError(String(e)));
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    let list = users;
    if (filter !== 'all') list = list.filter(u => u.subscription_status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.full_name?.toLowerCase() ?? '').includes(q) ||
        u.email.toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, filter, search]);

  if (error && !users) return <ErrorState message={error} onRetry={load} />;
  if (!users) return <LoadingState />;

  return (
    <View style={st.content}>
      {/* Search */}
      <TextInput
        style={st.searchInput}
        placeholder="Search by name or email…"
        placeholderTextColor={colors.grey}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/* Filters */}
      <View style={st.filterRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[st.filterChip, filter === f.id && st.filterActive]}
          >
            <Text style={[st.filterText, filter === f.id && st.filterTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader label="CUSTOMERS" count={filtered.length} />

      {filtered.map(u => (
        <View key={u.id}>
          <ListRow onPress={() => setExpanded(expanded === u.id ? null : u.id)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.name} numberOfLines={1}>{u.full_name || '(no name)'}</Text>
              <Text style={st.sub} numberOfLines={1}>{u.email}</Text>
            </View>
            <StatusPill status={u.subscription_status} />
            <Text style={st.date}>
              {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </ListRow>
          {expanded === u.id ? <CustomerDetailPanel userId={u.id} /> : null}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 14 },
  searchInput: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.white,
    marginBottom: 10,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ink4,
    backgroundColor: colors.surface2,
  },
  filterActive: { borderColor: colors.gold, backgroundColor: colors.goldBg },
  filterText: { fontSize: 11, fontWeight: '700', color: colors.grey2 },
  filterTextActive: { color: colors.gold },
  name: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  sub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  date: { fontSize: 10, fontWeight: '600', color: colors.grey, letterSpacing: 0.3 },
  detailCard: {
    marginTop: -2,
    marginBottom: 6,
    marginHorizontal: 4,
    padding: 14,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  detailSection: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.grey,
    marginTop: 12,
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailLabel: { fontSize: 12, color: colors.grey2 },
  detailValue: { fontSize: 12, fontWeight: '600', color: colors.white },
  detailLoading: { color: colors.grey2, fontSize: 12, padding: 12, textAlign: 'center' },
  detailError: { color: colors.red, fontSize: 12, padding: 12, textAlign: 'center' },
});
