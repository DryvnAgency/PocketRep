import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Pushover notification for support chat messages. The client supplies only a
// ticket id; identity, ticket ownership, rep display data, and message content
// are all re-derived from verified auth and service-role database reads.

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type NotifyBody = { ticket_id?: string };

function corsHeaders(origin: string | null) {
  const allowed = origin && (
    origin === 'https://pocketrep.pro'
    || origin === 'https://app.pocketrep.pro'
    || origin.endsWith('.vercel.app')
  );
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://app.pocketrep.pro',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method === 'GET') return json({ status: 'support-notify OK' }, 200, origin);
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'not authenticated' }, 401, origin);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'not authenticated' }, 401, origin);

  let payload: NotifyBody;
  try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400, origin); }
  const ticketId = String(payload?.ticket_id ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
    return json({ error: 'invalid ticket id' }, 400, origin);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .select('id,user_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) return json({ error: 'ticket lookup failed' }, 500, origin);
  if (!ticket || ticket.user_id !== user.id) return json({ error: 'ticket not found' }, 404, origin);

  const [{ data: profile }, { data: message, error: messageError }] = await Promise.all([
    admin.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle(),
    admin
      .from('support_messages')
      .select('content')
      .eq('ticket_id', ticketId)
      .eq('sender_role', 'rep')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (messageError) return json({ error: 'message lookup failed' }, 500, origin);
  if (!message?.content) return json({ error: 'message not found' }, 404, origin);

  const appToken = Deno.env.get('PUSHOVER_APP_TOKEN');
  const userKey = Deno.env.get('PUSHOVER_USER_KEY');
  if (!appToken || !userKey) {
    return json({ ok: true, delivered: false, reason: 'pushover not configured' }, 200, origin);
  }

  try {
    const response = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: appToken,
        user: userKey,
        title: `PocketRep Support: ${profile?.full_name || 'Rep'}`,
        message: `${String(message.content).slice(0, 200)}\n\n— ${profile?.email || 'unknown'}`,
        priority: 0,
        sound: 'pushover',
      }),
    });
    if (!response.ok) {
      console.error('Pushover error:', response.status, await response.text());
      return json({ ok: false, error: `pushover ${response.status}` }, 502, origin);
    }
    return json({ ok: true, delivered: true }, 200, origin);
  } catch (error) {
    console.error('Pushover fetch failed:', error);
    return json({ ok: false, error: 'pushover unreachable' }, 502, origin);
  }
});
