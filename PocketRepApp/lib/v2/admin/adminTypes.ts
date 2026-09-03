// Owner Control Center — shared types
// All data flows through Supabase RPC functions with admin role checks.

// ── Overview ────────────────────────────────────────────────────────────────

export type OverviewStats = {
  totalUsers: number;
  activeSubscriptions: number;
  trialingUsers: number;
  totalContacts: number;
  totalDeals: number;
  totalAiCost: number;    // cents, ALL TIME
  totalAiRequests: number;
  todaySignups: number;
  weekSignups: number;
  newPaidThisMonth: number;
  totalReferrals: number;
  rewardedReferrals: number;
  referralCustomers: number; // distinct users acquired via a rewarded referral
  openTickets: number;
};

// ── Stripe (from admin-stats edge function) ─────────────────────────────────
// MRR, cash collected (revenueThisMonth), and referral credit value are three
// SEPARATE numbers by design — never combine them into one figure.

export type StripeStats = {
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  canceledThisMonth: number;
  mrr: number;                     // cents — monthly recurring, from live Stripe prices
  revenueThisMonth: number;        // cents — net cash collected, after Stripe fees
  grossRevenueThisMonth: number;   // cents — before Stripe fees
  stripeFeesThisMonth: number;     // cents — grossRevenueThisMonth - revenueThisMonth
  referralCreditValue: number;     // cents — estimated value of applied referral credits (NOT revenue)
  appliedRewardCount: number;
  pendingRewardCount: number;
  newPaidThisMonth: number;
  error?: string;
};

// ── Customers ───────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  created_at: string;
  last_active_at: string | null;
  role: string;
};

export type CustomerDetail = {
  profile: AdminUser;
  contactCount: number;
  dealCount: number;
  dealGross: number;
  sequenceCount: number;
  interactionCount: number;
  nurtureSent: number;
  smsCount: number;
  aiCost: number;       // cents
  aiRequests: number;
  openTickets: number;
};

// ── AI Usage ────────────────────────────────────────────────────────────────

export type AiUsageRow = {
  user_id: string;
  email?: string;
  full_name?: string;
  total_cost: number;     // cents
  total_requests: number;
  total_input: number;
  total_output: number;
};

// ── Referrals ───────────────────────────────────────────────────────────────

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

// ── Referral Economics ──────────────────────────────────────────────────────

export type ReferralAdvocate = {
  userId: string;
  name: string | null;
  email: string;
  referralCount: number;
  rewardedCount: number;
  lifetimeCredits: number; // applied referral_rewards this user has received — 24-month cap tracking
};

export type ReferralEconomics = {
  funnel: {
    signups: number;
    verified: number;
    paid: number;
    rewarded: number;
    active: number;
  };
  credits: {
    pending: number;
    applied: number;
    failed: number;
    totalIssued: number;
  };
  advocates: ReferralAdvocate[];
  topAdvocates: ReferralAdvocate[];
  quality: {
    totalAdvocates: number;
    pctReferred1: number;
    pctReferred2Plus: number;
    pctReferred5Plus: number;
    avgReferralsPerAdvocate: number;
  };
};

export const REFERRAL_CREDIT_CAP = 24; // months — lifetime cap for display/monitoring only
export const REFERRAL_CREDIT_CAP_WARN = 20; // "near max" threshold

// ── AI Detail ───────────────────────────────────────────────────────────────

export type AiModelBreakdown = {
  model: string;
  totalCost: number;    // cents
  totalRequests: number;
  totalInput: number;
  totalOutput: number;
};

export type FirstWeekUser = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  costCents: number;
  requestCount: number;
};

export type AiDetail = {
  byModel: AiModelBreakdown[];
  firstWeekUsers: FirstWeekUser[];
};

export const FIRST_WEEK_CEILING_CENTS = 400; // first-week launch guard

// ── Growth Calculator ───────────────────────────────────────────────────────

export type GrowthScenario = {
  key: 'conservative' | 'base' | 'aggressive';
  label: string;
  monthlyGrowthRate: number; // fraction, e.g. 0.05 = 5%/mo new signups
  referralRate: number;      // fraction of active customers who successfully refer
  churnRate: number;         // fraction lost per month
};

// ── Date Range ──────────────────────────────────────────────────────────────

export type DateRangeKey = 'today' | '7d' | '30d' | '90d' | 'month' | 'lastMonth' | 'all' | 'custom';

export type DateRange = {
  key: DateRangeKey;
  label: string;
  start: string | null; // YYYY-MM-DD, inclusive; null = no lower bound
  end: string | null;   // YYYY-MM-DD, inclusive; null = no upper bound
};

// ── Alerts ──────────────────────────────────────────────────────────────────

export type AlertLevel = 'warning' | 'success' | 'info';

export type Alert = {
  level: AlertLevel;
  category: string;
  message: string;
};

// ── Milestones ──────────────────────────────────────────────────────────────

export const PAYING_MILESTONES = [100, 250, 500, 1000, 2500] as const;

// ── Outreach ────────────────────────────────────────────────────────────────

export type OutreachStats = {
  smsTotal: number;
  smsConfirmed: number;
  sequencesTotal: number;
  sequencesApproved: number;
  nurtureGenerated: number;
  nurtureSent: number;
  nurtureReplied: number;
  overdueFollowups: number;
};

// ── Product Usage ───────────────────────────────────────────────────────────

export type ProductUsageStats = {
  totalContacts: number;
  contactsThisWeek: number;
  contactsThisMonth: number;
  totalDeals: number;
  totalGross: number;
  totalSequences: number;
  totalNurtures: number;
  totalRexMessages: number;
  totalDigests: number;
  interactionsByType: {
    call: number;
    text: number;
    email: number;
    note: number;
  };
};

// ── Navigation ──────────────────────────────────────────────────────────────

export type AdminTabId =
  | 'overview'
  | 'customers'
  | 'revenue'
  | 'referrals'
  | 'ai'
  | 'product'
  | 'outreach'
  | 'support'
  | 'health'
  | 'settings';

export type AdminTab = {
  id: AdminTabId;
  label: string;
  icon: string;
};

export const ADMIN_TABS: AdminTab[] = [
  { id: 'overview',  label: 'Overview',  icon: '📊' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { id: 'revenue',   label: 'Revenue',   icon: '💰' },
  { id: 'referrals', label: 'Referrals', icon: '🔗' },
  { id: 'ai',        label: 'AI / Rex',  icon: '🤖' },
  { id: 'product',   label: 'Product',   icon: '📦' },
  { id: 'outreach',  label: 'Outreach',  icon: '📡' },
  { id: 'support',   label: 'Support',   icon: '💬' },
  { id: 'health',    label: 'Health',     icon: '🩺' },
  { id: 'settings',  label: 'Settings',  icon: '⚙️' },
];
