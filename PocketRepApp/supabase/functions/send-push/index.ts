// Expo Push wrapper. The client POSTs { user_id?, title, body, data }
// and we look up the rep's stored push tokens (via service role) and fan-out
// to https://exp.host/--/api/v2/push/send. verify_jwt=true so anyone calling
// must have a valid Supabase session — the caller's auth.uid() decides which
// tokens we read.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushBody = {
  user_id?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });

  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'no jwt' }, 401);

  let payload: PushBody;
  try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!payload?.title || !payload?.body) return json({ error: 'title + body required' }, 400);

  const auth_client = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await auth_client.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'invalid jwt' }, 401);
  const userId = payload.user_id ?? userData.user.id;
  if (userId !== userData.user.id) return json({ error: 'forbidden' }, 403);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: tokens } = await admin
    .from('user_push_tokens')
    .select('expo_token,platform')
    .eq('user_id', userId);
  const targets = (tokens ?? []).map(t => (t as any).expo_token).filter(Boolean);
  if (targets.length === 0) return json({ ok: true, delivered: 0, reason: 'no tokens' });

  const messages = targets.map((to: string) => ({
    to,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `expo ${res.status}`, detail: text }, 502);
  }
  const expo = await res.json();

  await admin
    .from('user_push_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('expo_token', targets);

  return json({ ok: true, delivered: targets.length, expo });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
