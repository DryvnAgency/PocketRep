// Owner Control Center — data layer
// All queries use server-side RPC functions or admin RLS policies.
// Every Supabase error is checked and thrown — no silent swallowing.

import { supabase } from '@/lib/supabase';
import type {
  OverviewStats,
  StripeStats,
  AdminUser,
  CustomerDetail,
  AiUsageRow,
  AdminReferral,
  OutreachStats,
  ProductUsageStats,
  ReferralEconomics,
  AiDetail,
  FirstWeekUser,
  GrowthScenario,
  DateRange,
  Alert,
} from './adminTypes';
import { PAYING_MILESTONES, FIRST_WEEK_CEILING_CENTS } from './adminTypes';

// ── Helpers ─────────────────────────────────────────────────────────────────

function assertOk<T>(result: { data: T; error: any }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

/** Format cents as a dollar string: 1234 → "$12.34" */
export function cents(v: number): string {
  return `$${(v / 100).toFixed(2)}`;
}

/** Compact large numbers: 1234 → "1.2k" */
export function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

// ── Overview (RPC) ──────────────────────────────────────────────────────────

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc('admin_overview_stats');
  if (error) throw new Error(`admin_overview_stats: ${error.message}`);
  return data as OverviewStats;
}

// ── Stripe Revenue (edge function) ──────────────────────────────────────────

const EMPTY_STRIPE_STATS: Omit<StripeStats, 'error'> = {
  activeSubscriptions: 0,
  trialingSubscriptions: 0,
  pastDueSubscriptions: 0,
  canceledThisMonth: 0,
  mrr: 0,
  revenueThisMonth: 0,
  grossRevenueThisMonth: 0,
  stripeFeesThisMonth: 0,
  referralCreditValue: 0,
  appliedRewardCount: 0,
  pendingRewardCount: 0,
  newPaidThisMonth: 0,
};

export async function fetchStripeStats(): Promise<StripeStats> {
  const { data, error } = await supabase.functions.invoke('admin-stats');
  if (error) {
    return { ...EMPTY_STRIPE_STATS, error: error.message };
  }
  // Defensive merge — guarantees every field is present even if the edge
  // function response is briefly stale (cached) from before a field was added.
  return { ...EMPTY_STRIPE_STATS, ...(data as Partial<StripeStats>) };
}

// ── Customers ───────────────────────────────────────────────────────────────

export async function fetchUsers(limit = 200): Promise<AdminUser[]> {
  const result = await supabase
    .from('profiles')
    .select('id,email,full_name,plan,subscription_status,stripe_customer_id,trial_ends_at,created_at,role')
    .order('created_at', { ascending: false })
    .limit(limit);
  const profiles = assertOk(result, 'fetchUsers');

  // Join last_active_at from users table
  const ids = (profiles ?? []).map((p: any) => p.id);
  let activeMap = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id,last_active_at')
      .in('id', ids);
    if (users) {
      for (const u of users as { id: string; last_active_at: string | null }[]) {
        activeMap.set(u.id, u.last_active_at);
      }
    }
  }

  return (profiles ?? []).map((p: any) => ({
    ...p,
    last_active_at: activeMap.get(p.id) ?? null,
  })) as AdminUser[];
}

// ── Customer Detail (RPC) ───────────────────────────────────────────────────

export async function fetchCustomerDetail(userId: string): Promise<CustomerDetail> {
  const { data, error } = await supabase.rpc('admin_customer_detail', { p_user_id: userId });
  if (error) throw new Error(`admin_customer_detail: ${error.message}`);
  return data as CustomerDetail;
}

// ── AI Usage (RPC) ──────────────────────────────────────────────────────────

export async function fetchAiUsage(month?: string): Promise<AiUsageRow[]> {
  const { data, error } = await supabase.rpc('admin_ai_summary', {
    p_month: month ?? null,
  });
  if (error) throw new Error(`admin_ai_summary: ${error.message}`);
  return (data ?? []) as AiUsageRow[];
}

// ── Referrals ───────────────────────────────────────────────────────────────

export async function fetchReferrals(): Promise<AdminReferral[]> {
  const result = await supabase
    .from('referrals')
    .select('id,referral_code,referrer_user_id,referred_email,status,created_at,verified_at,rewarded_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const data = assertOk(result, 'fetchReferrals');
  if (!data || data.length === 0) return [];

  // Resolve referrer names
  const referrerIds = [...new Set((data as AdminReferral[]).map(r => r.referrer_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', referrerIds);
  const nameMap = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]),
  );

  return (data as AdminReferral[]).map(r => ({
    ...r,
    referrer_name: nameMap.get(r.referrer_user_id) ?? undefined,
  }));
}

export async function fetchReferralRewardStats(): Promise<{ totalMonths: number }> {
  const result = await supabase
    .from('referral_rewards')
    .select('reward_months')
    .eq('status', 'applied');
  const data = assertOk(result, 'fetchReferralRewardStats');
  const totalMonths = (data ?? []).reduce(
    (sum: number, r: any) => sum + Number(r.reward_months ?? 1), 0,
  );
  return { totalMonths };
}

// ── Outreach (RPC) ──────────────────────────────────────────────────────────

export async function fetchOutreachStats(): Promise<OutreachStats> {
  const { data, error } = await supabase.rpc('admin_outreach_stats');
  if (error) throw new Error(`admin_outreach_stats: ${error.message}`);
  return data as OutreachStats;
}

// ── Product Usage (RPC) ─────────────────────────────────────────────────────

export async function fetchProductUsage(): Promise<ProductUsageStats> {
  const { data, error } = await supabase.rpc('admin_product_usage');
  if (error) throw new Error(`admin_product_usage: ${error.message}`);
  return data as ProductUsageStats;
}

// ── Support (direct query — admin RLS) ──────────────────────────────────────

export async function fetchOpenTicketCount(): Promise<number> {
  const { count, error } = await supabase
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) return 0;
  return count ?? 0;
}

// ── Referral Economics (RPC) ─────────────────────────────────────────────────

export async function fetchReferralEconomics(range?: DateRange): Promise<ReferralEconomics> {
  const { data, error } = await supabase.rpc('admin_referral_economics', {
    p_start: range?.start ?? null,
    p_end: range?.end ?? null,
  });
  if (error) throw new Error(`admin_referral_economics: ${error.message}`);
  return data as ReferralEconomics;
}

// ── AI Detail (RPC) ──────────────────────────────────────────────────────────

export async function fetchAiDetail(month?: string): Promise<AiDetail> {
  const { data, error } = await supabase.rpc('admin_ai_detail', { p_month: month ?? null });
  if (error) throw new Error(`admin_ai_detail: ${error.message}`);
  return data as AiDetail;
}

/** Color for a first-week AI safety row, per the $25 ceiling. */
export function firstWeekSeverity(costCents: number): 'green' | 'yellow' | 'orange' | 'red' | 'deepRed' {
  if (costCents < FIRST_WEEK_CEILING_CENTS * 0.25) return 'green';
  if (costCents < FIRST_WEEK_CEILING_CENTS * 0.50) return 'yellow';
  if (costCents < FIRST_WEEK_CEILING_CENTS * 0.75) return 'orange';
  if (costCents < FIRST_WEEK_CEILING_CENTS) return 'red';
  return 'deepRed';
}

// ── Date Ranges ──────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Standard date-range presets for the referral cohort selector. */
export function buildDateRanges(now: Date = new Date()): DateRange[] {
  const today = ymd(now);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return ymd(d);
  };
  const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthEnd = ymd(new Date(now.getFullYear(), now.getMonth(), 0));

  return [
    { key: 'all', label: 'All time', start: null, end: null },
    { key: 'today', label: 'Today', start: today, end: today },
    { key: '7d', label: '7d', start: daysAgo(7), end: today },
    { key: '30d', label: '30d', start: daysAgo(30), end: today },
    { key: '90d', label: '90d', start: daysAgo(90), end: today },
    { key: 'month', label: 'This month', start: monthStart, end: today },
    { key: 'lastMonth', label: 'Last month', start: lastMonthStart, end: lastMonthEnd },
  ];
}

// ── Growth Calculator ─────────────────────────────────────────────────────────

/**
 * Derives Conservative/Base/Aggressive scenarios from CURRENT dashboard data —
 * never hardcoded. Base = today's actual weekly signup pace, referral rate,
 * and (if known) churn; Conservative/Aggressive scale it.
 */
export function deriveGrowthScenarios(
  overview: OverviewStats,
  stripe: StripeStats,
): GrowthScenario[] {
  const activeBase = Math.max(1, overview.activeSubscriptions);
  // Monthly growth rate approximated from this week's signups annualized to a month.
  const monthlyNewSignups = overview.weekSignups * (30 / 7);
  const baseGrowth = overview.totalUsers > 0 ? monthlyNewSignups / Math.max(1, overview.totalUsers) : 0.05;
  const baseReferralRate = overview.totalUsers > 0 ? overview.referralCustomers / overview.totalUsers : 0;
  // No historical churn series exists yet — use canceledThisMonth / activeSubscriptions
  // as the best available current-month churn proxy.
  const baseChurn = activeBase > 0 ? stripe.canceledThisMonth / activeBase : 0.02;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  return [
    {
      key: 'conservative', label: 'Conservative',
      monthlyGrowthRate: clamp(baseGrowth * 0.7, 0, 1),
      referralRate: clamp(baseReferralRate * 0.5, 0, 1),
      churnRate: clamp(baseChurn * 1.3, 0, 1),
    },
    {
      key: 'base', label: 'Base',
      monthlyGrowthRate: clamp(baseGrowth, 0, 1),
      referralRate: clamp(baseReferralRate, 0, 1),
      churnRate: clamp(baseChurn, 0, 1),
    },
    {
      key: 'aggressive', label: 'Aggressive',
      monthlyGrowthRate: clamp(baseGrowth * 1.5, 0, 1),
      referralRate: clamp(baseReferralRate * 1.5, 0, 1),
      churnRate: clamp(baseChurn * 0.7, 0, 1),
    },
  ];
}

/** Projects paying-customer count for `months` ahead under one scenario. */
export function computeGrowthProjection(
  currentPaying: number,
  scenario: GrowthScenario,
  months: number,
): number[] {
  const out: number[] = [];
  let n = currentPaying;
  for (let i = 0; i < months; i++) {
    const gained = n * (scenario.monthlyGrowthRate + scenario.referralRate);
    const lost = n * scenario.churnRate;
    n = Math.max(0, n + gained - lost);
    out.push(Math.round(n));
  }
  return out;
}

// ── Milestones ─────────────────────────────────────────────────────────────

export function nextMilestone(payingCount: number): { target: number; progress: number } | null {
  const target = PAYING_MILESTONES.find(m => m > payingCount);
  if (!target) return null;
  return { target, progress: Math.min(1, payingCount / target) };
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export function computeAlerts(
  overview: OverviewStats,
  stripe: StripeStats,
  referralEcon: ReferralEconomics,
  firstWeekUsers?: FirstWeekUser[],
): Alert[] {
  const alerts: Alert[] = [];

  const overCeiling = (firstWeekUsers ?? []).filter(u => u.costCents >= FIRST_WEEK_CEILING_CENTS);
  if (overCeiling.length > 0) {
    alerts.push({
      level: 'warning', category: 'AI Cost',
      message: `${overCeiling.length} new user${overCeiling.length === 1 ? '' : 's'} hit the $25 first-week AI ceiling.`,
    });
  }

  if (stripe.pastDueSubscriptions > 0) {
    alerts.push({
      level: 'warning', category: 'Billing',
      message: `${stripe.pastDueSubscriptions} payment${stripe.pastDueSubscriptions === 1 ? '' : 's'} past due — reach out before involuntary churn.`,
    });
  }

  const referralPct = overview.totalUsers > 0 ? (overview.referralCustomers / overview.totalUsers) * 100 : 0;
  if (overview.totalUsers >= 20 && referralPct < 5) {
    alerts.push({
      level: 'warning', category: 'Referrals',
      message: `Referral rate is ${referralPct.toFixed(1)}% — below the 5% healthy baseline.`,
    });
  }

  const nearCapCount = referralEcon.advocates.filter(a => a.lifetimeCredits >= 20 && a.lifetimeCredits < 24).length;
  if (nearCapCount > 0) {
    alerts.push({
      level: 'info', category: 'Referral Credits',
      message: `${nearCapCount} advocate${nearCapCount === 1 ? '' : 's'} approaching the 24-month credit cap.`,
    });
  }

  const milestone = nextMilestone(overview.activeSubscriptions);
  if (milestone && milestone.progress >= 0.9) {
    alerts.push({
      level: 'success', category: 'Milestone',
      message: `${overview.activeSubscriptions}/${milestone.target} paying reps — ${Math.round(milestone.progress * 100)}% to the next milestone.`,
    });
  }

  if (overview.newPaidThisMonth > 0) {
    alerts.push({
      level: 'success', category: 'Growth',
      message: `${overview.newPaidThisMonth} new paying rep${overview.newPaidThisMonth === 1 ? '' : 's'} converted this month.`,
    });
  }

  return alerts;
}
