import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, stripe-signature',
};

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string, tolerance = 300) {
  const parts = sigHeader.split(',').reduce((acc: Record<string, string[]>, part) => {
    const [k, v] = part.split('=');
    (acc[k] ??= []).push(v);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || !signatures.length) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > tolerance) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return signatures.some(sig => sig.length === expected.length && [...sig].every((c, i) => c === expected[i]));
}

function planFromSubscription(sub: any): 'pro' | 'elite' {
  const meta = sub?.metadata?.plan || sub?.items?.data?.[0]?.price?.metadata?.plan || sub?.items?.data?.[0]?.price?.product?.metadata?.plan;
  return meta === 'elite' ? 'elite' : 'pro';
}

async function stripeRequest(path: string, method: string, body?: Record<string, unknown>) {
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) throw new Error('missing_stripe_secret');
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' } };
  if (body) {
    const form = new URLSearchParams();
    const append = (prefix: string, value: unknown) => {
      if (value === undefined || value === null) return;
      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) append(`${prefix}[${k}]`, v);
      } else form.append(prefix, String(value));
    };
    for (const [k, v] of Object.entries(body)) append(k, v);
    init.body = form.toString();
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe_${res.status}:${json?.error?.message ?? 'request_failed'}`);
  return json;
}

async function applyOneMonthFree(subscriptionId: string, rewardId: string) {
  const coupon = await stripeRequest('coupons', 'POST', {
    percent_off: 100,
    duration: 'once',
    name: `PocketRep referral — ${rewardId}`,
    metadata: { pocketrep_reward_id: rewardId },
  });
  await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, 'POST', {
    'discounts[0][coupon]': coupon.id,
    'metadata[pocketrep_referral_reward_id]': rewardId,
    proration_behavior: 'none',
  });
  return coupon.id as string;
}

async function qualifyAndRewardReferral(admin: any, referralId: string) {
  const { data: referral, error: refErr } = await admin.from('referrals').select('*').eq('id', referralId).maybeSingle();
  if (refErr || !referral || !referral.referred_user_id || !referral.referrer_user_id) return;
  if (referral.referrer_user_id === referral.referred_user_id) {
    await admin.from('referrals').update({ status: 'ineligible' }).eq('id', referralId);
    return;
  }
  if (!['verified', 'qualified', 'rewarded'].includes(referral.status)) return;
  if (!referral.stripe_subscription_id || !referral.stripe_customer_id) return;

  const sub = await stripeRequest(`subscriptions/${encodeURIComponent(referral.stripe_subscription_id)}`, 'GET');
  if (!['active', 'trialing'].includes(sub.status)) return;

  const now = new Date().toISOString();
  await admin.from('referrals').update({ status: 'qualified', qualified_at: referral.qualified_at ?? now }).eq('id', referralId);

  const recipients = [referral.referrer_user_id, referral.referred_user_id];
  for (const recipientUserId of recipients) {
    const { data: existingReward } = await admin.from('referral_rewards').select('id,status,stripe_credit_id').eq('referral_id', referralId).eq('recipient_user_id', recipientUserId).eq('reward_type', 'one_month_free').maybeSingle();
    if (existingReward?.status === 'applied') continue;

    const { data: recipientProfile } = await admin.from('profiles').select('stripe_customer_id,subscription_status,plan').eq('id', recipientUserId).maybeSingle();
    if (!recipientProfile?.stripe_customer_id || recipientProfile.plan !== 'elite' || !['active', 'trialing'].includes(recipientProfile.subscription_status ?? '')) continue;

    const list = await stripeRequest(`subscriptions?customer=${encodeURIComponent(recipientProfile.stripe_customer_id)}&status=all&limit=10`, 'GET');
    const recipientSub = (list.data ?? []).find((s: any) => ['active', 'trialing'].includes(s.status));
    const subscriptionId = recipientSub?.id as string | undefined;
    if (!subscriptionId) continue;

    let rewardId = existingReward?.id as string | undefined;
    if (!rewardId) {
      const { data: inserted, error: insertError } = await admin.from('referral_rewards').insert({ referral_id: referralId, recipient_user_id: recipientUserId, reward_type: 'one_month_free', status: 'pending' }).select('id').single();
      if (insertError && !String(insertError.message).toLowerCase().includes('duplicate')) {
        console.error('referral reward ledger insert failed', insertError);
        continue;
      }
      rewardId = inserted?.id;
      if (!rewardId) {
        const { data: retry } = await admin.from('referral_rewards').select('id,status').eq('referral_id', referralId).eq('recipient_user_id', recipientUserId).eq('reward_type', 'one_month_free').maybeSingle();
        rewardId = retry?.id;
      }
    }
    if (!rewardId) continue;

    try {
      const couponId = await applyOneMonthFree(subscriptionId, rewardId);
      await admin.from('referral_rewards').update({ status: 'applied', stripe_credit_id: couponId, applied_at: now }).eq('id', rewardId);
    } catch (err) {
      console.error('referral reward failed', rewardId, err);
      await admin.from('referral_rewards').update({ status: 'failed' }).eq('id', rewardId);
    }
  }

  const { data: allRewards } = await admin.from('referral_rewards').select('status').eq('referral_id', referralId);
  if ((allRewards ?? []).filter((r: any) => r.status === 'applied').length === 2) {
    await admin.from('referrals').update({ status: 'rewarded', rewarded_at: now }).eq('id', referralId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!secret || !serviceKey || !url) return new Response('Server misconfigured', { status: 500, headers });

  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature || !(await verifyStripeSignature(body, signature, secret))) return new Response('Invalid signature', { status: 401, headers });

  let event: any;
  try { event = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
  const admin = createClient(url, serviceKey);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.customer_details?.email || session.customer_email;
        const customerId = session.customer;
        if (!email && !customerId) break;
        const updates = { stripe_customer_id: customerId, plan: session.metadata?.plan || 'elite', subscription_status: 'active', trial_ends_at: null };
        const { error } = customerId
          ? await admin.from('profiles').update(updates).eq('stripe_customer_id', customerId)
          : await admin.from('profiles').update(updates).eq('email', email);
        if (error) console.error('checkout update', error);

        const refCode = typeof session.client_reference_id === 'string' ? session.client_reference_id : null;
        if (refCode && /^PR-[A-Z0-9]{10}$/.test(refCode) && customerId) {
          const { data: referral } = await admin.from('referrals').select('id').eq('stripe_customer_id', customerId).maybeSingle();
          if (referral?.id) await qualifyAndRewardReferral(admin, referral.id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const updates: Record<string, unknown> = { plan: planFromSubscription(sub), subscription_status: sub.status };
        if (sub.status === 'active') updates.trial_ends_at = null;
        const { error } = await admin.from('profiles').update(updates).eq('stripe_customer_id', sub.customer);
        if (error) console.error('subscription update', error);
        const { data: referral } = await admin.from('referrals').select('id').eq('stripe_subscription_id', sub.id).maybeSingle();
        if (referral?.id) await qualifyAndRewardReferral(admin, referral.id);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { error } = await admin.from('profiles').update({ subscription_status: 'canceled' }).eq('stripe_customer_id', sub.customer);
        if (error) console.error('subscription delete update', error);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const { error } = await admin.from('profiles').update({ subscription_status: 'past_due' }).eq('stripe_customer_id', invoice.customer);
        if (error) console.error('payment failed update', error);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const { error } = await admin.from('profiles').update({ subscription_status: 'active' }).eq('stripe_customer_id', invoice.customer);
        if (error) console.error('payment success update', error);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Webhook processing error', err);
    return new Response('Webhook processing error', { status: 500, headers });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
});
