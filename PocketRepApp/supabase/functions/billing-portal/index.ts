import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cancellation Policy (cancel.html) explicitly promises "In-app: Go to
// Settings → Subscription → Cancel" — no such path existed anywhere in the
// app. This function hands the client a Stripe-hosted Billing Portal session
// URL for the signed-in rep's own customer, so cancel / plan change /
// payment-method update are Stripe's own UI, not a second billing system
// built and maintained here.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pocketrep.pro";

function corsHeaders(origin: string | null) {
  const ok = origin && (origin === "https://pocketrep.pro" || origin === "https://app.pocketrep.pro" || origin.endsWith(".vercel.app"));
  return {
    "Access-Control-Allow-Origin": ok ? (origin as string) : "https://app.pocketrep.pro",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  if (!STRIPE_SECRET_KEY) return json({ ok: false, error: "not_configured" }, 503, origin);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, error: "not_authenticated" }, 401, origin);

  // Identity always comes from the verified JWT — never a client-supplied
  // user id or customer id — so a rep can only ever open a portal session
  // for their own Stripe customer.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "not_authenticated" }, 401, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileErr } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (profileErr) return json({ ok: false, error: "profile_lookup_failed" }, 500, origin);
  if (!profile?.stripe_customer_id) return json({ ok: false, error: "no_stripe_customer" }, 404, origin);

  const body = new URLSearchParams();
  body.set("customer", profile.stripe_customer_id);
  body.set("return_url", APP_URL.replace(/\/$/, ""));

  const r = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ ok: false, error: j?.error?.message ?? "stripe_error" }, 502, origin);

  return json({ ok: true, url: j.url as string }, 200, origin);
});
