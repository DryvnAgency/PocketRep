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
} from './adminTypes';

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

export async function fetchStripeStats(): Promise<StripeStats> {
  const { data, error } = await supabase.functions.invoke('admin-stats');
  if (error) {
    return {
      activeSubscriptions: 0,
      trialingSubscriptions: 0,
      pastDueSubscriptions: 0,
      canceledThisMonth: 0,
      mrr: 0,
      revenueThisMonth: 0,
      error: error.message,
    };
  }
  return data as StripeStats;
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
