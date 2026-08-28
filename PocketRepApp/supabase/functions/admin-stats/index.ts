import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function corsHeaders(origin: string | null) {
  const ok = origin && (
    origin === "https://pocketrep.pro" ||
    origin === "https://app.pocketrep.pro" ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)
  );
  return {
    "Access-Control-Allow-Origin": ok ? origin as string : "https://pocketrep.pro",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

// Simple in-memory cache (5 min TTL) to avoid hammering Stripe.
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function stripeGet(path: string): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!r.ok) throw new Error(`Stripe ${r.status}: ${await r.text()}`);
  return r.json();
}

/** Paginate through all Stripe subscriptions for a given status. */
async function listAllSubscriptions(status: string): Promise<any[]> {
  const all: any[] = [];
  let hasMore = true;
  let startingAfter: string | null = null;
  while (hasMore) {
    const qs = `status=${status}&limit=100${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
    const page = await stripeGet(`/subscriptions?${qs}`);
    for (const sub of page.data ?? []) all.push(sub);
    hasMore = page.has_more;
    if (page.data?.length) startingAfter = page.data[page.data.length - 1].id;
  }
  return all;
}

async function fetchStats(admin: ReturnType<typeof createClient>) {
  // Active subscriptions + MRR (paginated — handles >100 subs).
  // MRR is derived entirely from each subscription's live Stripe price —
  // never hard-coded — so founder pricing, discounts, grandfathered plans,
  // and annual billing are all reflected automatically.
  const activeSubs = await listAllSubscriptions("active");
  const activeSubscriptions = activeSubs.length;
  let mrr = 0;
  for (const sub of activeSubs) {
    for (const item of sub.items?.data ?? []) {
      const price = item.price;
      if (!price) continue;
      const amount = price.unit_amount ?? 0;
      if (price.recurring?.interval === "month") mrr += amount;
      else if (price.recurring?.interval === "year") mrr += Math.round(amount / 12);
    }
  }
  // Average monthly price per active sub — used below to value referral
  // credits without an extra round-trip to Stripe's coupon API.
  const avgMonthlyPriceCents = activeSubscriptions > 0 ? Math.round(mrr / activeSubscriptions) : 0;

  // Trialing subscriptions
  const trialingSubs = await listAllSubscriptions("trialing");
  const trialingSubscriptions = trialingSubs.length;

  // Past-due subscriptions (failed payments)
  const pastDueSubs = await listAllSubscriptions("past_due");
  const pastDueSubscriptions = pastDueSubs.length;

  // Canceled this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000);
  let canceledThisMonth = 0;
  {
    let hasMore = true;
    let startingAfter: string | null = null;
    while (hasMore) {
      const qs = `status=canceled&limit=100&created[gte]=${monthStartUnix}${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
      const page = await stripeGet(`/subscriptions?${qs}`);
      canceledThisMonth += page.data?.length ?? 0;
      hasMore = page.has_more;
      if (page.data?.length) startingAfter = page.data[page.data.length - 1].id;
    }
  }

  // Revenue this month — use balance transactions. Track BOTH gross (amount)
  // and net (after Stripe fees) so the dashboard can show them as separate
  // numbers — cash collected is net; gross/fees are shown as a breakdown.
  let revenueThisMonth = 0;      // net — cash actually collected
  let grossRevenueThisMonth = 0; // gross — before Stripe's processing fees
  {
    let hasMore = true;
    let startingAfter: string | null = null;
    while (hasMore) {
      const qs = `created[gte]=${monthStartUnix}&limit=100&type=charge${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
      const txns = await stripeGet(`/balance_transactions?${qs}`);
      for (const t of txns.data ?? []) {
        revenueThisMonth += t.net ?? 0;
        grossRevenueThisMonth += t.amount ?? 0;
      }
      hasMore = txns.has_more;
      if (txns.data?.length) startingAfter = txns.data[txns.data.length - 1].id;
    }
  }
  const stripeFeesThisMonth = Math.max(0, grossRevenueThisMonth - revenueThisMonth);

  // New paid this month — subscriptions created this month that are currently active.
  let newPaidThisMonth = 0;
  for (const sub of activeSubs) {
    if ((sub.created ?? 0) >= monthStartUnix) newPaidThisMonth++;
  }

  // Referral credit value — referral rewards are Stripe coupons (100% off,
  // one billing cycle), NOT an internal credit balance. We value them at the
  // average active subscription price rather than re-querying Stripe's coupon
  // API, since that price already reflects real, current, per-customer rates.
  // This is a SEPARATE number from MRR and from cash collected — never summed
  // into either on the dashboard.
  let appliedRewardCount = 0;
  let pendingRewardCount = 0;
  try {
    const { count: applied } = await admin
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied");
    const { count: pending } = await admin
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    appliedRewardCount = applied ?? 0;
    pendingRewardCount = pending ?? 0;
  } catch {
    // referral_rewards read is best-effort — a failure here must never break
    // the rest of the Stripe stats payload.
  }
  const referralCreditValue = appliedRewardCount * avgMonthlyPriceCents;

  return {
    activeSubscriptions,
    trialingSubscriptions,
    pastDueSubscriptions,
    canceledThisMonth,
    mrr,
    revenueThisMonth,
    grossRevenueThisMonth,
    stripeFeesThisMonth,
    referralCreditValue,
    appliedRewardCount,
    pendingRewardCount,
    newPaidThisMonth,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

  if (!STRIPE_SECRET_KEY) {
    return json({ error: "STRIPE_SECRET_KEY not configured" }, 503, origin);
  }

  // Verify caller is admin
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!auth) return json({ error: "unauthorized" }, 401, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await admin.auth.getUser(auth);
  if (!user) return json({ error: "unauthorized" }, 401, origin);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return json({ error: "forbidden" }, 403, origin);

  // Return cached if fresh
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return json(cache.data, 200, origin);
  }

  try {
    const data = await fetchStats(admin);
    cache = { data, ts: Date.now() };
    return json(data, 200, origin);
  } catch (e) {
    return json({ error: String(e) }, 502, origin);
  }
});
