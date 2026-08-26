// Pushover notification for support chat messages. Fires when a rep
// sends a new message so the PocketRep admin gets an instant alert.
// JWT-gated — only authenticated users can trigger this.

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

type NotifyBody = {
  ticket_id: string;
  message_preview: string;
  rep_name: string;
  rep_email: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Health check
  if (req.method === 'GET') return json({ status: 'support-notify OK' });

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Validate JWT presence (the edge function runtime verifies the token
  // via verify_jwt=true in config — we just need it to exist).
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'no jwt' }, 401);

  let payload: NotifyBody;
  try { payload = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!payload?.message_preview) return json({ error: 'message_preview required' }, 400);

  const appToken = Deno.env.get('PUSHOVER_APP_TOKEN');
  const userKey = Deno.env.get('PUSHOVER_USER_KEY');

  if (!appToken || !userKey) {
    // Secrets not set yet — swallow silently so the chat still works.
    return json({ ok: true, delivered: false, reason: 'pushover not configured' });
  }

  try {
    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: appToken,
        user: userKey,
        title: `PocketRep Support: ${payload.rep_name || 'Rep'}`,
        message: `${payload.message_preview}\n\n— ${payload.rep_email || 'unknown'}`,
        priority: 0,
        sound: 'pushover',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Pushover error:', res.status, text);
      return json({ ok: false, error: `pushover ${res.status}` }, 502);
    }

    return json({ ok: true, delivered: true });
  } catch (e) {
    console.error('Pushover fetch failed:', e);
    return json({ ok: false, error: 'pushover unreachable' }, 502);
  }
});
