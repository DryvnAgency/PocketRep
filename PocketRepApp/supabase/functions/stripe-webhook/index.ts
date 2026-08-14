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
        const updates = { stripe_customer_id: customerId, plan: session.metadata?.plan || 'pro', subscription_status: 'active', trial_ends_at: null };
        const { error } = customerId
          ? await admin.from('profiles').update(updates).eq('stripe_customer_id', customerId)
          : await admin.from('profiles').update(updates).eq('email', email);
        if (error) console.error('checkout update', error);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const updates: Record<string, unknown> = { plan: planFromSubscription(sub), subscription_status: sub.status };
        if (sub.status === 'active') updates.trial_ends_at = null;
        const { error } = await admin.from('profiles').update(updates).eq('stripe_customer_id', sub.customer);
        if (error) console.error('subscription update', error);
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
