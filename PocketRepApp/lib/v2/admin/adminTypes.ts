// Owner Control Center — shared types
// All data flows through Supabase RPC functions with admin role checks.

// ── Overview ────────────────────────────────────────────────────────────────

export type OverviewStats = {
  totalUsers: number;
  activeSubscriptions: number;
  trialingUsers: number;
  totalContacts: number;
  totalDeals: number;
  totalAiCost: number;    // cents
  totalAiRequests: number;
  totalReferrals: number;
  rewardedReferrals: number;
  openTickets: number;
};

// ── Stripe (from admin-stats edge function) ─────────────────────────────────

export type StripeStats = {
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  canceledThisMonth: number;
  mrr: number;            // cents
  revenueThisMonth: number; // cents
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
