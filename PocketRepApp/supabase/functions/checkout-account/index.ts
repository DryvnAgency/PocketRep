import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// PocketRep — checkout-account
// Backs the paid-signup Thank You page (pocketrep.pro/thankyou.html). Two actions:
//   • verify   {session_id}            -> confirms a real, completed Stripe Checkout
//                                         Session and returns the STRIPE-VERIFIED email.
//   • provision{session_id, password}  -> idempotently creates the Supabase account
//                                         with that verified email + the customer's
//                                         chosen password, links the Stripe customer,
//                                         and returns a one-time magic link into the app.
//
// Security model:
//   - The email ALWAYS comes from the verified Stripe session, never from the client.
//   - Stripe secret + service-role key live only here (never in the browser).
//   - The endpoint is gated by an unguessable, paid session_id; account creation is
//     idempotent via the stripe_checkout_provisions ledger (one session => one account),
//     so refreshing the page creates no duplicate user/profile/demos/Stripe link.
//   - handle_new_user (unchanged) seeds the profile + exactly 3 is_demo contacts.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Optional hardening: if set, the session's subscription price must match.
const STRIPE_ELITE_PRICE_ID = Deno.env.get("STRIPE_ELITE_PRICE_ID") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pocketrep.pro";

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && (origin === "https://pocketrep.pro" || origin.endsWith(".vercel.app"));
  return {
    "Access-Control-Allow-Origin": ok ? (origin as string) : "https://pocketrep.pro",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

type Verified = {
  email: string;
  customerId: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
};

// Retrieve + validate the Checkout Session directly from Stripe's REST API
// (the repo has no Stripe SDK; every backend call in this codebase uses fetch).
async function verifySession(sessionId: string): Promise<{ ok: true; v: Verified } | { ok: false; status: number; error: string }> {
  const url =
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}` +
    `?expand[]=customer&expand[]=subscription&expand[]=subscription.items.data.price`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
  if (res.status === 404) return { ok: false, status: 404, error: "session_not_found" };
  if (!res.ok) return { ok: false, status: 502, error: "stripe_error" };
  const s = await res.json();

  // Checkout must actually be complete, and be the expected subscription purchase.
  if (s.status !== "complete") return { ok: false, status: 402, error: "checkout_incomplete" };
  if (s.mode !== "subscription") return { ok: false, status: 400, error: "unexpected_session" };

  const email: string | null =
    s.customer_details?.email ??
    (s.customer && typeof s.customer === "object" ? s.customer.email : null) ??
    s.customer_email ??
    null;
  if (!email) return { ok: false, status: 400, error: "no_email_on_session" };

  const customerId: string | null =
    typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);

  const sub = s.subscription && typeof s.subscription === "object" ? s.subscription : null;

  // Optional price pin.
  if (STRIPE_ELITE_PRICE_ID) {
    const priceId = sub?.items?.data?.[0]?.price?.id ?? null;
    if (priceId !== STRIPE_ELITE_PRICE_ID) return { ok: false, status: 400, error: "unexpected_price" };
  }

  const subscriptionStatus: string | null = sub?.status ?? null;
  const trialEndsAt: string | null =
    sub?.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

  return { ok: true, v: { email: email.trim().toLowerCase(), customerId, subscriptionStatus, trialEndsAt } };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method === "GET") return json({ ok: true, service: "checkout-account" }, 200, origin);
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  if (!STRIPE_SECRET_KEY) {
    // Owner has not set the Stripe secret yet — fail clearly, do nothing.
    return json({ ok: false, error: "not_configured" }, 503, origin);
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const action = String(body.action ?? "");
  const sessionId = String(body.session_id ?? "").trim();

  if (!sessionId || !sessionId.startsWith("cs_")) {
    return json({ ok: false, error: "invalid_session_id" }, 400, origin);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── VERIFY ────────────────────────────────────────────────────────────────
  if (action === "verify") {
    const r = await verifySession(sessionId);
    if (!r.ok) return json({ ok: false, error: r.error }, r.status, origin);
    const { data: ledger } = await admin
      .from("stripe_checkout_provisions")
      .select("session_id")
      .eq("session_id", sessionId)
      .maybeSingle();
    return json(
      { ok: true, email: r.v.email, plan: "elite", alreadyProvisioned: !!ledger },
      200,
      origin,
    );
  }

  // ── PROVISION ───────────────────────────────────────────────────────────────
  if (action === "provision") {
    // Idempotent short-circuit: already provisioned -> just hand back a fresh magic
    // link (no password needed; the paid session_id is the proof of ownership).
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
      return json(
        { ok: true, alreadyProvisioned: true, action_link: link?.properties?.action_link ?? null },
        200,
        origin,
      );
    }

    const password = String(body.password ?? "");
    if (password.length < 8) return json({ ok: false, error: "weak_password" }, 400, origin);

    // Verify the session server-side; the email comes ONLY from Stripe.
    const r = await verifySession(sessionId);
    if (!r.ok) return json({ ok: false, error: r.error }, r.status, origin);
    const { email, customerId, subscriptionStatus, trialEndsAt } = r.v;

    // Create the account (auto-confirmed — Stripe already verified the email).
    // handle_new_user seeds the profile + exactly 3 is_demo contacts.
    let userId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { plan: "elite" },
    });
    if (created?.user?.id) {
      userId = created.user.id;
    } else if (createErr) {
      // Duplicate email (already registered) -> reuse the existing account (idempotent).
      const msg = (createErr.message || "").toLowerCase();
      const dup = msg.includes("already") || msg.includes("registered") || (createErr as any).status === 422;
      if (!dup) return json({ ok: false, error: "create_failed" }, 500, origin);
      const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      userId = prof?.id ?? null;
      if (!userId) return json({ ok: false, error: "account_lookup_failed" }, 500, origin);
    }

    // Link the Stripe customer + reflect the verified subscription state onto the
    // profile (service role bypasses the billing-field lock). Does NOT change the
    // entitlement policy — decideAccess is untouched.
    await admin
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        plan: "elite",
        subscription_status: subscriptionStatus ?? "trialing",
        trial_ends_at: trialEndsAt,
      })
      .eq("id", userId);

    // Record the ledger row so a refresh/replay never re-provisions.
    await admin
      .from("stripe_checkout_provisions")
      .upsert(
        { session_id: sessionId, user_id: userId, email, stripe_customer_id: customerId },
        { onConflict: "session_id" },
      );

    // One-time magic link that lands the customer signed-in on the app host,
    // crossing the pocketrep.pro -> app.pocketrep.pro origin boundary.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: APP_URL },
    });
    if (linkErr || !link?.properties?.action_link) {
      // Account exists; the customer can still sign in with their password.
      return json({ ok: true, alreadyProvisioned: false, action_link: null }, 200, origin);
    }

    return json(
      { ok: true, alreadyProvisioned: false, action_link: link.properties.action_link },
      200,
      origin,
    );
  }

  return json({ ok: false, error: "unknown_action" }, 400, origin);
});
