// Stripe Webhook handler for PocketRep
// Verifies Stripe signature, then updates profiles table on payment events.
// Required secrets: STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, stripe-signature",
};

// ── Crypto helpers for Stripe signature verification ──────────────────
async function timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): Promise<boolean> {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  tolerance = 300 // 5 minutes
): Promise<boolean> {
  const parts = sigHeader.split(",").reduce(
    (acc: Record<string, string[]>, part: string) => {
      const [k, v] = part.split("=");
      (acc[k] = acc[k] || []).push(v);
      return acc;
    },
    {} as Record<string, string[]>
  );

  const timestamp = parts["t"]?.[0];
  const signatures = parts["v1"] || [];

  if (!timestamp || signatures.length === 0) return false;

  // Check timestamp tolerance
  const ts = parseInt(timestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > tolerance) return false;

  // Compute expected signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(timestamp + "." + payload)
  );

  const expectedHex = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Compare against any v1 signature
  return signatures.some((sig) => {
    if (sig.length !== expectedHex.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedHex.charCodeAt(i);
    }
    return diff === 0;
  });
}

// ── Determine plan from Stripe price / product metadata ───────────────
function planFromEvent(data: Record<string, any>): "pro" | "elite" {
  // Check metadata first (set "plan" on your Stripe Product or Price)
  const meta =
    data?.metadata?.plan ||
    data?.items?.data?.[0]?.price?.metadata?.plan ||
    data?.items?.data?.[0]?.price?.product?.metadata?.plan;
  if (meta === "elite") return "elite";
  return "pro"; // default
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return new Response("Server misconfigured", { status: 500, headers: CORS_HEADERS });
  }

  // Read raw body for signature verification
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400, headers: CORS_HEADERS });
  }

  // Verify signature
  const valid = await verifyStripeSignature(body, sig, WEBHOOK_SECRET);
  if (!valid) {
    console.error("Invalid Stripe signature");
    return new Response("Invalid signature", { status: 401, headers: CORS_HEADERS });
  }

  const event = JSON.parse(body);
  console.log("Stripe event:", event.type, event.id);

  // Supabase admin client (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    switch (event.type) {
      // ── Checkout completed ─────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const stripeCustomerId = session.customer;
        const plan = session.metadata?.plan || "pro";

        if (!customerEmail) {
          console.error("No customer email in checkout session");
          break;
        }

        const { error } = await supabase
          .from("profiles")
          .update({
            stripe_customer_id: stripeCustomerId,
            plan: plan,
            trial_ends_at: null, // paid — clear trial
          })
          .eq("email", customerEmail);

        if (error) console.error("DB update error (checkout):", error);
        else console.log("Profile updated for", customerEmail, "plan:", plan);
        break;
      }

      // ── Subscription updated (upgrade / downgrade / renewal) ───────
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const stripeCustomerId = sub.customer;
        const plan = planFromEvent(sub);
        const isActive = ["active", "trialing"].includes(sub.status);

        if (!isActive) {
          console.log("Subscription not active, status:", sub.status);
          break;
        }

        const { error } = await supabase
          .from("profiles")
          .update({ plan })
          .eq("stripe_customer_id", stripeCustomerId);

        if (error) console.error("DB update error (sub updated):", error);
        else console.log("Subscription updated for customer", stripeCustomerId, "plan:", plan);
        break;
      }

      // ── Subscription deleted / cancelled ───────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const stripeCustomerId = sub.customer;

        // Downgrade to pro (free tier) when subscription ends
        const { error } = await supabase
          .from("profiles")
          .update({ plan: "pro" })
          .eq("stripe_customer_id", stripeCustomerId);

        if (error) console.error("DB update error (sub deleted):", error);
        else console.log("Subscription cancelled for customer", stripeCustomerId);
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const stripeCustomerId = invoice.customer;
        console.warn("Payment failed for customer", stripeCustomerId);
        // Optionally downgrade or flag the account here
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response("Webhook processing error", { status: 500, headers: CORS_HEADERS });
  }

  // Always return 200 to Stripe so it doesn't retry
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
