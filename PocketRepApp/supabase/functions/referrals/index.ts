import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.pocketrep.pro';

function cors(origin: string | null) {
  const allowed = origin === 'https://app.pocketrep.pro' || origin === 'https://pocketrep.pro' || !!origin?.endsWith('.vercel.app');
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'https://app.pocketrep.pro',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, origin);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ ok: false, error: 'not_authenticated' }, 401, origin);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: 'not_authenticated' }, 401, origin);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile } = await admin.from('profiles').select('plan,subscription_status,email').eq('id', user.id).maybeSingle();
  if (!['active', 'trialing'].includes(profile?.subscription_status ?? '')) {
    return json({ ok: false, error: 'subscription_required' }, 403, origin);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? 'get');
  if (action !== 'get') return json({ ok: false, error: 'unknown_action' }, 400, origin);

  const { data: codeData, error: codeError } = await admin.rpc('ensure_my_referral_code', {}, { headers: { Authorization: auth } });
  if (codeError || !codeData) return json({ ok: false, error: 'referral_code_unavailable' }, 500, origin);

  const { data: referrals } = await admin
    .from('referrals')
    .select('id,referred_email,status,created_at,qualified_at,rewarded_at')
    .eq('referrer_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: rewards } = await admin
    .from('referral_rewards')
    .select('id,referral_id,status,created_at,applied_at')
    .eq('recipient_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const successful = (referrals ?? []).filter((r: any) => ['qualified', 'rewarded'].includes(r.status)).length;
  const earned = (rewards ?? []).filter((r: any) => r.status === 'applied').length;

  return json({
    ok: true,
    code: codeData,
    referralLink: `${APP_URL.replace(/\/$/, '')}/?ref=${encodeURIComponent(codeData)}`,
    referrals: referrals ?? [],
    rewards: rewards ?? [],
    successful,
    monthsEarned: earned,
  }, 200, origin);
});
