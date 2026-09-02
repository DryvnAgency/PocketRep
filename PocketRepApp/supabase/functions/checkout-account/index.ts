import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_ELITE_PRICE_ID") ?? "";
const V1_CURRENT_PRICE_ID = "price_1Tf6MeIKMImSDGHZvYLmeIqS";
const V1_LEGACY_29_PRICE_ID = "price_1UBDLeIKMImSDGHZqrYthX3H";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pocketrep.pro";

function allowedStripePriceIds() {
  return new Set([STRIPE_PRICE_ID, V1_CURRENT_PRICE_ID, V1_LEGACY_29_PRICE_ID].filter(Boolean));
}

function corsHeaders(origin: string | null) {
  const ok = origin && (
    origin === "https://pocketrep.pro" ||
    origin === "https://app.pocketrep.pro" ||
    origin.endsWith(".vercel.app")
  );
  return {
    "Access-Control-Allow-Origin": ok ? origin as string : "https://pocketrep.pro",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

type Verified = {
  email: string;
  customerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  referralCode: string | null;
};

async function verifySession(id: string): Promise<
  { ok: true; v: Verified } | { ok: false; status: number; error: string }
> {
  const r = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=customer&expand[]=subscription&expand[]=subscription.items.data.price`,
    { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
  );
  if (r.status === 404) return { ok: false, status: 404, error: "session_not_found" };
  if (!r.ok) return { ok: false, status: 502, error: "stripe_error" };

  const s = await r.json();
  if (s.status !== "complete") return { ok: false, status: 402, error: "checkout_incomplete" };
  if (s.mode !== "subscription") return { ok: false, status: 400, error: "unexpected_session" };

  const email = (
    s.customer_details?.email ??
    (s.customer && typeof s.customer === "object" ? s.customer.email : null) ??
    s.customer_email ??
    null
  ) as string | null;
  if (!email) return { ok: false, status: 400, error: "no_email_on_session" };

  const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
  const subscriptionId = typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
  const sub = s.subscription && typeof s.subscription === "object" ? s.subscription : null;

  const allowedPriceIds = allowedStripePriceIds();
  if (!allowedPriceIds.size) {
    console.error("checkout-account: no allowed Stripe price is configured — refusing to provision");
    return { ok: false, status: 503, error: "price_not_configured" };
  }
  const checkoutPriceId = sub?.items?.data?.[0]?.price?.id;
  if (!checkoutPriceId || !allowedPriceIds.has(checkoutPriceId)) {
    return { ok: false, status: 400, error: "unexpected_price" };
  }

  const referralCode = typeof s.client_reference_id === "string" && /^PR-[A-Z0-9]{10}$/.test(s.client_reference_id)
    ? s.client_reference_id
    : null;

  return {
    ok: true,
    v: {
      email: email.trim().toLowerCase(),
      customerId,
      subscriptionId,
      subscriptionStatus: sub?.status ?? null,
      trialEndsAt: sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      referralCode,
    },
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method === "GET") return json({ ok: true, service: "checkout-account" }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  if (!STRIPE_SECRET_KEY) return json({ ok: false, error: "not_configured" }, 503, origin);

  let body: any = {};
  try { body = await req.json(); } catch {}

  const action = String(body.action ?? "");
  const sessionId = String(body.session_id ?? "").trim();
  if (!sessionId.startsWith("cs_")) return json({ ok: false, error: "invalid_session_id" }, 400, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (action === "verify") {
    const r = await verifySession(sessionId);
    if (!r.ok) return json({ ok: false, error: r.error }, r.status, origin);
    const { data: ledger } = await admin
      .from("stripe_checkout_provisions")
      .select("session_id")
      .eq("session_id", sessionId)
      .maybeSingle();
    return json({
      ok: true,
      email: r.v.email,
      plan: "pocketrep",
      alreadyProvisioned: !!ledger,
      referralApplied: !!r.v.referralCode,
    }, 200, origin);
  }

  if (action !== "provision") return json({ ok: false, error: "unknown_action" }, 400, origin);

  const { data: existing } = await admin
    .from("stripe_checkout_provisions")
    .select("email")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existing?.email) {
    const { data: link } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: existing.email,
      options: { redirectTo: APP_URL },
    });
    return json({ ok: true, alreadyProvisioned: true, action_link: link?.properties?.action_link ?? null }, 200, origin);
  }

  const password = String(body.password ?? "");
  if (password.length < 8) return json({ ok: false, error: "weak_password" }, 400, origin);

  const r = await verifySession(sessionId);
  if (!r.ok) return json({ ok: false, error: r.error }, r.status, origin);
  const { email, customerId, subscriptionId, subscriptionStatus, trialEndsAt, referralCode } = r.v;

  let referrerUserId: string | null = null;
  if (referralCode) {
    const { data: ref } = await admin.from("profiles").select("id").eq("referral_code", referralCode).maybeSingle();
    const { data: existingProfile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (ref?.id && ref.id !== existingProfile?.id && !existingProfile) referrerUserId = ref.id;
  }

  let userId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { plan: "pocketrep" },
  });

  if (created?.user?.id) {
    userId = created.user.id;
  } else if (createErr) {
    const msg = (createErr.message || "").toLowerCase();
    const dup = msg.includes("already") || msg.includes("registered") || (createErr as any).status === 422;
    if (!dup) return json({ ok: false, error: "create_failed" }, 500, origin);

    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("id,stripe_customer_id,subscription_status,entitlement_status")
      .eq("email", email)
      .maybeSingle();
    if (profErr || !prof?.id) return json({ ok: false, error: "account_lookup_failed" }, 500, origin);

    const existingCustomerId = typeof prof.stripe_customer_id === "string"
      ? prof.stripe_customer_id.trim()
      : "";

    // A public checkout must never silently move an existing PocketRep account
    // onto a different Stripe customer. This prevents double-checkout/stale-tab
    // rebinding and prevents a third party who knows an email address from
    // controlling that account's entitlement with their own Stripe customer.
    if (existingCustomerId && existingCustomerId !== customerId) {
      console.warn("checkout-account: blocked Stripe customer rebind for existing account", {
        userId: prof.id,
        existingCustomerId,
        attemptedCustomerId: customerId,
        subscriptionStatus: prof.subscription_status,
        entitlementStatus: prof.entitlement_status,
      });
      return json({ ok: false, error: "account_already_billed" }, 409, origin);
    }

    userId = prof.id;
    referrerUserId = null;
  }

  const normalizedStatus = (subscriptionStatus ?? "active").toLowerCase();
  const verified = ["active", "trialing"].includes(normalizedStatus);
  const profilePatch = Object.assign(
    {
      stripe_customer_id: customerId,
      plan: "pocketrep",
      subscription_status: normalizedStatus,
      trial_ends_at: trialEndsAt,
    },
    verified
      ? { entitlement_status: normalizedStatus, entitlement_pending_until: null }
      : { entitlement_status: "pending", entitlement_pending_until: new Date(Date.now() + 5 * 60 * 1000).toISOString() },
  );

  const { error: profileUpdateErr } = await admin.from("profiles").update(profilePatch).eq("id", userId);
  if (profileUpdateErr) {
    console.error("checkout-account profile update failed:", profileUpdateErr.message);
    return json({ ok: false, error: "profile_update_failed" }, 500, origin);
  }

  await admin.from("stripe_checkout_provisions").upsert({
    session_id: sessionId,
    user_id: userId,
    email,
    stripe_customer_id: customerId,
  }, { onConflict: "session_id" });

  if (referrerUserId && referralCode && userId !== referrerUserId) {
    const { error: refErr } = await admin.from("referrals").insert({
      referral_code: referralCode,
      referrer_user_id: referrerUserId,
      referred_user_id: userId,
      referred_email: email,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: "verified",
      verified_at: new Date().toISOString(),
    });
    if (refErr) console.error("referral insert failed:", refErr.message);
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: APP_URL },
  });
  return json({
    ok: true,
    alreadyProvisioned: false,
    action_link: linkErr ? null : link?.properties?.action_link ?? null,
  }, 200, origin);
});
