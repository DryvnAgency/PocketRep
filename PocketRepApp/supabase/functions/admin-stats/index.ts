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

async function fetchStats() {
  // Active subscriptions + MRR (paginated — handles >100 subs)
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

  // Revenue this month — use balance transactions (net after Stripe fees)
  let revenueThisMonth = 0;
  {
    let hasMore = true;
    let startingAfter: string | null = null;
    while (hasMore) {
      const qs = `created[gte]=${monthStartUnix}&limit=100&type=charge${startingAfter ? `&starting_after=${startingAfter}` : ""}`;
      const txns = await stripeGet(`/balance_transactions?${qs}`);
      for (const t of txns.data ?? []) {
        revenueThisMonth += t.net ?? 0;
      }
      hasMore = txns.has_more;
      if (txns.data?.length) startingAfter = txns.data[txns.data.length - 1].id;
    }
  }

  return {
    activeSubscriptions,
    trialingSubscriptions,
    pastDueSubscriptions,
    canceledThisMonth,
    mrr,
    revenueThisMonth,
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
    const data = await fetchStats();
    cache = { data, ts: Date.now() };
    return json(data, 200, origin);
  } catch (e) {
    return json({ error: String(e) }, 502, origin);
  }
});
