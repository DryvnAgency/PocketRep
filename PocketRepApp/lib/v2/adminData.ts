// Admin dashboard data fetching. All queries rely on admin RLS policies
// (profiles.role = 'admin') — no service-role key is exposed to the client.

import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  subscription_status: string;
  created_at: string;
};

export type AdminReferral = {
  id: string;
  referral_code: string;
  referrer_user_id: string;
  referred_email: string | null;
  status: string;
  created_at: string;
  verified_at: string | null;
  rewarded_at: string | null;
  referrer_name?: string;
};

export type AiUsageRow = {
  user_id: string;
  email?: string;
  full_name?: string;
  total_cost: number;
  total_requests: number;
  total_input: number;
  total_output: number;
  last_active: string | null;
};

export type OverviewStats = {
  totalUsers: number;
  todaySignups: number;
  weekSignups: number;
  activeSubscribers: number;
  totalAiCostCents: number;
  totalReferrals: number;
  rewardedReferrals: number;
};

// ── Overview ───────────────────────────────────────────────────────────────

export async function fetchOverviewStats(): Promise<OverviewStats> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

  const [
    { count: totalUsers },
    { count: todaySignups },
    { count: weekSignups },
    { count: activeSubscribers },
    { data: aiCost },
    { count: totalReferrals },
    { count: rewardedReferrals },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .gte('created_at', startOfWeek.toISOString()),
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
    supabase.from('monthly_ai_usage').select('cost_cents')
      .gte('usage_month', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`),
    supabase.from('referrals').select('id', { count: 'exact', head: true }),
    supabase.from('referrals').select('id', { count: 'exact', head: true })
      .eq('status', 'rewarded'),
  ]);

  const totalAiCostCents = (aiCost ?? []).reduce(
    (sum, r) => sum + Number((r as { cost_cents: number }).cost_cents ?? 0), 0,
  );

  return {
    totalUsers: totalUsers ?? 0,
    todaySignups: todaySignups ?? 0,
    weekSignups: weekSignups ?? 0,
    activeSubscribers: activeSubscribers ?? 0,
    totalAiCostCents,
    totalReferrals: totalReferrals ?? 0,
    rewardedReferrals: rewardedReferrals ?? 0,
  };
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function fetchUsers(): Promise<AdminUser[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id,email,full_name,plan,subscription_status,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as AdminUser[];
}

// ── Referrals ──────────────────────────────────────────────────────────────

export async function fetchReferrals(): Promise<AdminReferral[]> {
  const { data } = await supabase
    .from('referrals')
    .select('id,referral_code,referrer_user_id,referred_email,status,created_at,verified_at,rewarded_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (!data) return [];

  // Resolve referrer names from profiles
  const referrerIds = [...new Set((data as AdminReferral[]).map(r => r.referrer_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', referrerIds);
  const nameMap = new Map((profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));

  return (data as AdminReferral[]).map(r => ({
    ...r,
    referrer_name: nameMap.get(r.referrer_user_id) ?? undefined,
  }));
}

export async function fetchReferralRewardStats(): Promise<{ totalMonths: number }> {
  const { data } = await supabase
    .from('referral_rewards')
    .select('reward_months')
    .eq('status', 'applied');
  const totalMonths = (data ?? []).reduce(
    (sum, r) => sum + Number((r as { reward_months: number }).reward_months ?? 1), 0,
  );
  return { totalMonths };
}

// ── AI Usage ───────────────────────────────────────────────────────────────

export async function fetchAiUsageByUser(): Promise<AiUsageRow[]> {
  // Get per-user totals from monthly_ai_usage
  const { data: usage } = await supabase
    .from('monthly_ai_usage')
    .select('user_id,input_tokens,output_tokens,cost_cents,request_count,usage_month');
  if (!usage) return [];

  // Aggregate by user
  const byUser = new Map<string, AiUsageRow>();
  for (const r of usage as { user_id: string; input_tokens: number; output_tokens: number; cost_cents: number; request_count: number; usage_month: string }[]) {
    const existing = byUser.get(r.user_id);
    if (existing) {
      existing.total_cost += Number(r.cost_cents);
      existing.total_requests += Number(r.request_count);
      existing.total_input += Number(r.input_tokens);
      existing.total_output += Number(r.output_tokens);
      if (!existing.last_active || r.usage_month > existing.last_active) {
        existing.last_active = r.usage_month;
      }
    } else {
      byUser.set(r.user_id, {
        user_id: r.user_id,
        total_cost: Number(r.cost_cents),
        total_requests: Number(r.request_count),
        total_input: Number(r.input_tokens),
        total_output: Number(r.output_tokens),
        last_active: r.usage_month,
      });
    }
  }

  // Join names from profiles
  const ids = [...byUser.keys()];
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,email,full_name')
    .in('id', ids);
  for (const p of (profiles ?? []) as { id: string; email: string; full_name: string | null }[]) {
    const row = byUser.get(p.id);
    if (row) { row.email = p.email; row.full_name = p.full_name ?? undefined; }
  }

  return [...byUser.values()].sort((a, b) => b.total_cost - a.total_cost);
}

// ── Stripe Revenue (via edge function) ─────────────────────────────────────

export type StripeStats = {
  activeSubscriptions: number;
  mrr: number;          // cents
  revenueThisMonth: number; // cents
  error?: string;
};

export async function fetchStripeStats(): Promise<StripeStats> {
  try {
    const { data, error } = await supabase.functions.invoke('admin-stats');
    if (error) return { activeSubscriptions: 0, mrr: 0, revenueThisMonth: 0, error: error.message };
    return data as StripeStats;
  } catch (e) {
    return { activeSubscriptions: 0, mrr: 0, revenueThisMonth: 0, error: String(e) };
  }
}
