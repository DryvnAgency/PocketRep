import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { colors, radius } from '@/constants/theme';
import AdminSupportDashboard from './AdminSupportDashboard';
import {
  fetchOverviewStats,
  fetchUsers,
  fetchReferrals,
  fetchReferralRewardStats,
  fetchAiUsageByUser,
  fetchStripeStats,
  type OverviewStats,
  type AdminUser,
  type AdminReferral,
  type AiUsageRow,
  type StripeStats,
} from '@/lib/v2/adminData';

type TabId = 'overview' | 'users' | 'referrals' | 'ai' | 'revenue' | 'support';
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
  { id: 'ai', label: 'AI Usage', icon: '🤖' },
  { id: 'revenue', label: 'Revenue', icon: '💰' },
  { id: 'support', label: 'Support', icon: '💬' },
];

function cents(v: number): string {
  return `$${(v / 100).toFixed(2)}`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'active' ? colors.green
    : status === 'trialing' ? colors.gold
    : status === 'canceled' ? colors.red
    : colors.grey2;
  return (
    <Text style={[s.pill, { color, borderColor: color }]}>{status.toUpperCase()}</Text>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────

function OverviewTab() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [stripe, setStripe] = useState<StripeStats | null>(null);

  useEffect(() => {
    fetchOverviewStats().then(setStats).catch(() => {});
    fetchStripeStats().then(setStripe).catch(() => {});
  }, []);

  if (!stats) return <Text style={s.loading}>Loading…</Text>;

  return (
    <View style={s.tabContent}>
      <Text style={s.sectionTitle}>USERS</Text>
      <View style={s.statRow}>
        <StatCard label="Total users" value={String(stats.totalUsers)} />
        <StatCard label="Today" value={String(stats.todaySignups)} sub="sign-ups" />
        <StatCard label="This week" value={String(stats.weekSignups)} sub="sign-ups" />
        <StatCard label="Active subs" value={String(stats.activeSubscribers)} />
      </View>

      <Text style={s.sectionTitle}>REVENUE</Text>
      <View style={s.statRow}>
        <StatCard label="MRR" value={stripe ? cents(stripe.mrr) : '…'} />
        <StatCard label="This month" value={stripe ? cents(stripe.revenueThisMonth) : '…'} />
        <StatCard label="Active subs" value={stripe ? String(stripe.activeSubscriptions) : '…'} sub="Stripe" />
      </View>
      {stripe?.error ? <Text style={s.errorHint}>Stripe: {stripe.error}</Text> : null}

      <Text style={s.sectionTitle}>AI USAGE</Text>
      <View style={s.statRow}>
        <StatCard label="AI cost (month)" value={cents(stats.totalAiCostCents)} />
      </View>

      <Text style={s.sectionTitle}>REFERRALS</Text>
      <View style={s.statRow}>
        <StatCard label="Total referrals" value={String(stats.totalReferrals)} />
        <StatCard label="Rewarded" value={String(stats.rewardedReferrals)} />
      </View>
    </View>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [userAi, setUserAi] = useState<AiUsageRow | null>(null);

  useEffect(() => { fetchUsers().then(setUsers).catch(() => {}); }, []);

  const openUser = async (u: AdminUser) => {
    if (expanded === u.id) { setExpanded(null); setUserAi(null); return; }
    setExpanded(u.id);
    setUserAi(null);
    try {
      const all = await fetchAiUsageByUser();
      setUserAi(all.find(r => r.user_id === u.id) ?? { user_id: u.id, total_cost: 0, total_requests: 0, total_input: 0, total_output: 0, last_active: null });
    } catch { /* */ }
  };

  if (!users) return <Text style={s.loading}>Loading…</Text>;

  return (
    <View style={s.tabContent}>
      <Text style={s.sectionTitle}>ALL USERS · {users.length}</Text>
      {users.map(u => (
        <View key={u.id}>
          <Pressable onPress={() => openUser(u)} style={({ pressed }) => [s.listRow, pressed && s.pressed]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.listName} numberOfLines={1}>{u.full_name || '(no name)'}</Text>
              <Text style={s.listSub} numberOfLines={1}>{u.email}</Text>
            </View>
            <StatusPill status={u.subscription_status} />
            <Text style={s.listDate}>{new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
          </Pressable>
          {expanded === u.id ? (
            <View style={s.expandedCard}>
              <Text style={s.expandedLabel}>Plan: <Text style={s.expandedValue}>{u.plan}</Text></Text>
              <Text style={s.expandedLabel}>Status: <Text style={s.expandedValue}>{u.subscription_status}</Text></Text>
              <Text style={s.expandedLabel}>Joined: <Text style={s.expandedValue}>{new Date(u.created_at).toLocaleDateString()}</Text></Text>
              {userAi ? (
                <>
                  <Text style={s.expandedLabel}>AI cost: <Text style={s.expandedValue}>{cents(userAi.total_cost)}</Text></Text>
                  <Text style={s.expandedLabel}>AI requests: <Text style={s.expandedValue}>{userAi.total_requests}</Text></Text>
                  <Text style={s.expandedLabel}>Last active: <Text style={s.expandedValue}>{userAi.last_active ?? 'never'}</Text></Text>
                </>
              ) : <Text style={s.expandedLabel}>Loading AI data…</Text>}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ── Referrals Tab ─────────────────────────────────────────────────────────

function ReferralsTab() {
  const [referrals, setReferrals] = useState<AdminReferral[] | null>(null);
  const [rewardMonths, setRewardMonths] = useState(0);

  useEffect(() => {
    fetchReferrals().then(setReferrals).catch(() => {});
    fetchReferralRewardStats().then(r => setRewardMonths(r.totalMonths)).catch(() => {});
  }, []);

  if (!referrals) return <Text style={s.loading}>Loading…</Text>;

  const verified = referrals.filter(r => r.status !== 'pending').length;

  return (
    <View style={s.tabContent}>
      <View style={s.statRow}>
        <StatCard label="Total" value={String(referrals.length)} />
        <StatCard label="Verified" value={String(verified)} />
        <StatCard label="Rewarded" value={String(referrals.filter(r => r.status === 'rewarded').length)} />
        <StatCard label="Free months" value={String(rewardMonths)} sub="given" />
      </View>
      <Text style={s.sectionTitle}>ALL REFERRALS</Text>
      {referrals.map(r => (
        <View key={r.id} style={s.listRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.listName} numberOfLines={1}>{r.referrer_name || r.referrer_user_id.slice(0, 8)}</Text>
            <Text style={s.listSub} numberOfLines={1}>→ {r.referred_email ?? '(pending)'}</Text>
          </View>
          <StatusPill status={r.status} />
          <Text style={s.listDate}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
        </View>
      ))}
    </View>
  );
}

// ── AI Usage Tab ──────────────────────────────────────────────────────────

function AiUsageTab() {
  const [rows, setRows] = useState<AiUsageRow[] | null>(null);

  useEffect(() => { fetchAiUsageByUser().then(setRows).catch(() => {}); }, []);

  if (!rows) return <Text style={s.loading}>Loading…</Text>;

  const totalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
  const totalReqs = rows.reduce((sum, r) => sum + r.total_requests, 0);

  return (
    <View style={s.tabContent}>
      <View style={s.statRow}>
        <StatCard label="Total cost" value={cents(totalCost)} />
        <StatCard label="Total requests" value={String(totalReqs)} />
        <StatCard label="Users with usage" value={String(rows.length)} />
      </View>
      <Text style={s.sectionTitle}>BY USER (highest cost first)</Text>
      {rows.map(r => (
        <View key={r.user_id} style={s.listRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.listName} numberOfLines={1}>{r.full_name || r.email || r.user_id.slice(0, 8)}</Text>
            <Text style={s.listSub}>{r.total_requests} requests · last {r.last_active ?? '—'}</Text>
          </View>
          <Text style={s.aiCost}>{cents(r.total_cost)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Revenue Tab ───────────────────────────────────────────────────────────

function RevenueTab() {
  const [stripe, setStripe] = useState<StripeStats | null>(null);

  useEffect(() => { fetchStripeStats().then(setStripe).catch(() => {}); }, []);

  if (!stripe) return <Text style={s.loading}>Loading…</Text>;
  if (stripe.error) {
    return (
      <View style={s.tabContent}>
        <Text style={s.sectionTitle}>STRIPE</Text>
        <View style={s.errorCard}>
          <Text style={s.errorTitle}>Couldn't load Stripe data</Text>
          <Text style={s.errorBody}>{stripe.error}</Text>
          <Text style={s.errorHint}>Make sure STRIPE_SECRET_KEY is set in Supabase Edge Function secrets.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.tabContent}>
      <Text style={s.sectionTitle}>STRIPE · LIVE</Text>
      <View style={s.statRow}>
        <StatCard label="Active subs" value={String(stripe.activeSubscriptions)} />
        <StatCard label="MRR" value={cents(stripe.mrr)} />
        <StatCard label="Revenue (month)" value={cents(stripe.revenueThisMonth)} />
      </View>
    </View>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────

export default function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>POCKETREP</Text>
        <Text style={s.headerSub}>ADMIN</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onSignOut} style={s.signOutBtn}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(t => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, tab === t.id && s.tabActive]}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {tab === 'overview' ? <OverviewTab /> : null}
        {tab === 'users' ? <UsersTab /> : null}
        {tab === 'referrals' ? <ReferralsTab /> : null}
        {tab === 'ai' ? <AiUsageTab /> : null}
        {tab === 'revenue' ? <RevenueTab /> : null}
        {tab === 'support' ? (
          <AdminSupportDashboard open onClose={() => {}} embedded />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink4,
  },
  logo: { color: colors.gold, fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  headerSub: { color: colors.grey, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ink4,
  },
  signOutText: { color: colors.grey2, fontSize: 11, fontWeight: '700' },

  tabBar: { borderBottomWidth: 1, borderBottomColor: colors.ink4, flexGrow: 0 },
  tabBarContent: { paddingHorizontal: 12, gap: 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.gold },
  tabIcon: { fontSize: 13 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: colors.grey2 },
  tabLabelActive: { color: colors.gold },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  tabContent: { padding: 14 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.grey,
    marginTop: 18,
    marginBottom: 8,
  },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    flex: 1,
    minWidth: 120,
    padding: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: colors.grey, textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.gold, marginTop: 4 },
  statSub: { fontSize: 10, color: colors.grey2, marginTop: 2 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  pressed: { opacity: 0.85 },
  listName: { fontSize: 14, fontWeight: '600', color: colors.white, letterSpacing: -0.2 },
  listSub: { fontSize: 11, color: colors.grey2, marginTop: 2 },
  listDate: { fontSize: 10, fontWeight: '600', color: colors.grey, letterSpacing: 0.3 },

  pill: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },

  expandedCard: {
    marginTop: -2,
    marginBottom: 6,
    marginHorizontal: 4,
    padding: 12,
    backgroundColor: colors.ink2,
    borderWidth: 1,
    borderColor: colors.ink4,
    borderRadius: radius.md,
  },
  expandedLabel: { fontSize: 12, color: colors.grey2, marginBottom: 4 },
  expandedValue: { color: colors.white, fontWeight: '600' },

  aiCost: { fontSize: 14, fontWeight: '800', color: colors.gold },

  errorCard: {
    padding: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.redBorder,
    borderRadius: radius.md,
  },
  errorTitle: { fontSize: 14, fontWeight: '700', color: colors.red },
  errorBody: { fontSize: 12, color: colors.grey2, marginTop: 6 },
  errorHint: { fontSize: 11, color: colors.grey, marginTop: 8, fontStyle: 'italic' },

  loading: { color: colors.grey2, fontSize: 13, textAlign: 'center', marginTop: 40 },
});
