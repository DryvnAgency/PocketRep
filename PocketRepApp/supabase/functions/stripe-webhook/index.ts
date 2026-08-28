import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, stripe-signature" };

async function verify(payload: string, sigHeader: string, secret: string, tolerance = 300) {
  const parts = sigHeader.split(",").reduce((a: Record<string, string[]>, p) => { const [k, v] = p.split("="); (a[k] ??= []).push(v); return a; }, {});
  const t = parts.t?.[0], sigs = parts.v1 ?? [];
  if (!t || !sigs.length) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
  return sigs.some(s => {
    if (s.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return mismatch === 0;
  });
}

async function stripe(path: string, method: string, body?: Record<string, unknown>, idempotencyKey?: string) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("missing_stripe_secret");
  const stripeHeaders: Record<string, string> = { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" };
  if (idempotencyKey) stripeHeaders["Idempotency-Key"] = idempotencyKey;
  const init: RequestInit = { method, headers: stripeHeaders };
  if (body) { const f = new URLSearchParams(); for (const [k, v] of Object.entries(body)) f.append(k, String(v)); init.body = f.toString(); }
  const r = await fetch(`https://api.stripe.com/v1/${path}`, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `stripe_${r.status}`);
  return j;
}

async function profileIdForCustomer(admin: any, customerId: string) {
  const { data: byStripe } = await admin.from("profiles").select("id,email,stripe_customer_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (byStripe?.id) return byStripe.id;
  const customer = await stripe(`customers/${encodeURIComponent(customerId)}`, "GET");
  const email = String(customer?.email || "").toLowerCase();
  if (!email) return null;
  const { data: byEmail } = await admin.from("profiles").select("id,email,stripe_customer_id").eq("email", email).maybeSingle();
  if (byEmail?.id) {
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", byEmail.id);
    return byEmail.id;
  }
  return null;
}

// Lifetime cap on stacked "give a month, get a month" rewards per recipient.
// Without this, a referrer with enough referrals could accumulate unbounded
// free months — unbounded revenue leakage, not a feature. 24 months (2 years)
// caps the exposure per account while still rewarding heavy referrers.
const REFERRAL_REWARD_CAP_MONTHS = 24;

async function reward(admin: any, referral: any) {
  if (!referral?.id || !referral.referrer_user_id || !referral.referred_user_id || referral.referrer_user_id === referral.referred_user_id || referral.status === "rewarded") return;
  const recipients = [referral.referrer_user_id, referral.referred_user_id];
  let applied = 0;
  for (const recipient of recipients) {
    const { data: p } = await admin.from("profiles").select("stripe_customer_id,subscription_status").eq("id", recipient).maybeSingle();
    if (!p?.stripe_customer_id || !["active", "trialing"].includes(p.subscription_status ?? "")) continue;
    const { data: existing } = await admin.from("referral_rewards").select("id,status,stripe_credit_id").eq("referral_id", referral.id).eq("recipient_user_id", recipient).eq("reward_type", "one_month_free").maybeSingle();
    if (existing?.status === "applied") { applied++; continue; }
    if (!existing) {
      const { data: totalRows } = await admin.from("referral_rewards").select("reward_months").eq("recipient_user_id", recipient).eq("status", "applied");
      const totalApplied = (totalRows ?? []).reduce((sum: number, r: any) => sum + Number(r.reward_months ?? 0), 0);
      if (totalApplied >= REFERRAL_REWARD_CAP_MONTHS) continue; // lifetime cap reached for this account
    }
    const subs = await stripe(`subscriptions?customer=${encodeURIComponent(p.stripe_customer_id)}&status=all&limit=10`, "GET");
    const sub = (subs.data ?? []).find((s: any) => ["active", "trialing"].includes(s.status));
    if (!sub?.id) continue;
    let rewardId = existing?.id;
    if (!rewardId) {
      const { data: ins, error } = await admin.from("referral_rewards").insert({ referral_id: referral.id, recipient_user_id: recipient, reward_months: 1, reward_type: "one_month_free", status: "pending" }).select("id").single();
      if (error && !String(error.message).toLowerCase().includes("duplicate")) continue;
      rewardId = ins?.id;
      if (!rewardId) { const { data: r } = await admin.from("referral_rewards").select("id,status").eq("referral_id", referral.id).eq("recipient_user_id", recipient).eq("reward_type", "one_month_free").maybeSingle(); rewardId = r?.id; }
    }
    if (!rewardId) continue;
    try {
      const coupon = await stripe("coupons", "POST", { percent_off: 100, duration: "once", name: `PocketRep referral ${rewardId}`, metadata: { pocketrep_reward_id: rewardId } }, `pocketrep_referral_coupon_${rewardId}`);
      await stripe(`subscriptions/${encodeURIComponent(sub.id)}`, "POST", { "discounts[0][coupon]": coupon.id, proration_behavior: "none", "metadata[pocketrep_referral_reward_id]": rewardId }, `pocketrep_referral_apply_${rewardId}`);
      await admin.from("referral_rewards").update({ status: "applied", stripe_credit_id: coupon.id, issued_at: new Date().toISOString(), applied_at: new Date().toISOString() }).eq("id", rewardId);
      applied++;
    } catch (e) { console.error("reward failed", rewardId, e); await admin.from("referral_rewards").update({ status: "failed" }).eq("id", rewardId); }
  }
  const now = new Date().toISOString();
  await admin.from("referrals").update({ status: applied === 2 ? "rewarded" : "qualified", qualified_at: referral.qualified_at ?? now, rewarded_at: applied === 2 ? now : referral.rewarded_at }).eq("id", referral.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), url = Deno.env.get("SUPABASE_URL");
  if (!secret || !key || !url) return new Response("Server misconfigured", { status: 500, headers });
  const body = await req.text(), sig = req.headers.get("stripe-signature");
  if (!sig || !(await verify(body, sig, secret))) return new Response("Invalid signature", { status: 401, headers });
  let event: any; try { event = JSON.parse(body); } catch { return new Response("Invalid JSON", { status: 400, headers }); }
  const admin = createClient(url, key);

  if (event.id) {
    const now = new Date().toISOString();
    const { data: inserted } = await admin.from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type, status: "processing", processing_started_at: now, processed_at: null })
      .select("event_id")
      .maybeSingle();
    if (!inserted) {
      const { data: existing } = await admin.from("stripe_webhook_events")
        .select("status,processing_started_at")
        .eq("event_id", event.id)
        .maybeSingle();
      if (existing?.status === "processed") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
      }
      const started = existing?.processing_started_at ? new Date(existing.processing_started_at).getTime() : 0;
      const stale = !started || Date.now() - started > 5 * 60 * 1000;
      if (existing?.status === "failed" || stale) {
        const { data: reclaimed } = await admin.from("stripe_webhook_events")
          .update({ status: "processing", processing_started_at: now, processed_at: null })
          .eq("event_id", event.id)
          .select("event_id")
          .maybeSingle();
        if (!reclaimed) return new Response("Webhook already processing", { status: 409, headers });
      } else {
        return new Response("Webhook already processing", { status: 409, headers });
      }
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Checkout completion provisions the account, but does NOT qualify a referral
        // or force a trial subscription to active. Stripe's paid invoice is the trigger.
        const s = event.data.object, email = String(s.customer_details?.email || s.customer_email || "").toLowerCase(), customer = s.customer;
        if (email && customer) {
          const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
          if (profile?.id) await admin.from("profiles").update({ stripe_customer_id: customer, plan: "pocketrep" }).eq("id", profile.id);
        }
        if (customer) {
          const { data: ref } = await admin.from("referrals").select("*").eq("stripe_customer_id", customer).maybeSingle();
          if (ref) await admin.from("referrals").update({ stripe_checkout_session_id: s.id }).eq("id", ref.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const s = event.data.object, profileId = await profileIdForCustomer(admin, s.customer);
        if (profileId) await admin.from("profiles").update(Object.assign({ plan: "pocketrep", subscription_status: s.status, trial_ends_at: s.status === "trialing" && s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null }, ["active","trialing"].includes(s.status) ? { entitlement_status: null, entitlement_pending_until: null } : {})).eq("id", profileId);
        break;
      }
      case "customer.subscription.deleted": {
        const s = event.data.object, profileId = await profileIdForCustomer(admin, s.customer);
        if (profileId) await admin.from("profiles").update({ subscription_status: "canceled" }).eq("id", profileId);
        break;
      }
      case "invoice.payment_failed": {
        const i = event.data.object, profileId = await profileIdForCustomer(admin, i.customer);
        if (profileId) await admin.from("profiles").update({ subscription_status: "past_due" }).eq("id", profileId);
        break;
      }
      case "invoice.payment_succeeded": {
        const i = event.data.object, profileId = await profileIdForCustomer(admin, i.customer);
        if (profileId) await admin.from("profiles").update({ subscription_status: "active", entitlement_status: null, entitlement_pending_until: null }).eq("id", profileId);
        // Referral qualification is intentionally tied to a successful subscription invoice.
        const subscriptionId = typeof i.subscription === "string" ? i.subscription : i.subscription?.id ?? null;
        const { data: ref } = await admin.from("referrals").select("*").eq("stripe_customer_id", i.customer).maybeSingle();
        if (ref && subscriptionId && ref.status !== "rewarded") {
          await admin.from("referrals").update({ paid_at: ref.paid_at ?? new Date().toISOString(), stripe_subscription_id: ref.stripe_subscription_id ?? subscriptionId, status: "qualified" }).eq("id", ref.id);
          const { data: u } = await admin.from("referrals").select("*").eq("id", ref.id).single();
          await reward(admin, u);
        }
        break;
      }
    }
    if (event.id) {
      await admin.from("stripe_webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString(), processing_started_at: null })
        .eq("event_id", event.id);
    }
  } catch (e) {
    if (event.id) {
      await admin.from("stripe_webhook_events")
        .update({ status: "failed", processing_started_at: null })
        .eq("event_id", event.id);
    }
    console.error("Webhook processing error", e);
    return new Response("Webhook processing error", { status: 500, headers });
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
});