// Daily nurture scheduler. Designed to be hit by pg_cron once per morning.
// verify_jwt=false so the scheduler can hit us without a session; access
// control is the X-Cron-Secret header (set this via `supabase secrets set
// CRON_SECRET=...` once, then configure pg_cron to send the same value).
//
// What it does on every invocation:
//   1. Look up today's row in public.holiday_calendar.
//   2. If a holiday is today — for each rep in public.users, queue holiday
//      nurture drafts for eligible contacts (cadence + variety enforced).
//   3. On Mondays, also run a quarterly check-in (max 10 contacts/rep).
//   4. Fire a push notification to each rep whose queue grew.
//
// Brain calls go DIRECTLY to OpenRouter (same model list as ai-proxy) rather
// than back through ai-proxy/brain — server-side fan-out has no user JWT to
// satisfy ai-proxy's per-user rate limiter.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const POCKETREP_API_KEY = Deno.env.get('POCKETREP_API_KEY') ?? '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BRAIN_MODELS = ['x-ai/grok-4.3', 'moonshotai/kimi-k2.6'];
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const REX_COPY_RULES = `COPY RULES (apply to every draft):
Tone: casual, lowercase opener ("hey" / "hola" / "qué onda"), no jargon, no emojis.
Punctuation: NEVER use dashes of any kind (—, –, or - between phrases). No bullets, no semicolons. Short sentences.
Closers (pick one): "let me know if I can help with anything" / "just say the word" / "avísame si te puedo ayudar con algo" / "nomás dime". NEVER use "no rush", "no pressure", "no hurry".
Anti-patterns (NEVER generate): "just checking in", "following up on our last conversation", "hope this finds you well", "hope all is well", "I wanted to reach out", "touching base".
Spanish is a rewrite, target Mexican slang ("carro" not "coche", "chamba" for work, "nomás" for "just").
Under 280 characters, 2-4 sentences. One hook, one CTA, done.
Inferred mileage / lease-end — soften ("if you're getting close to your cap") instead of fabricating numbers.`;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }
  if (CRON_SECRET) {
    const got = req.headers.get('X-Cron-Secret') ?? '';
    if (got !== CRON_SECRET) return new Response('forbidden', { status: 403 });
  }
  if (!POCKETREP_API_KEY) {
    return json({ ok: false, error: 'POCKETREP_API_KEY not configured' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const today = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date().getUTCDay();

  const { data: holidayRow } = await admin
    .from('holiday_calendar')
    .select('holiday_name,tone_guidance,pitch_intensity,applies_to_dead_leads,applies_to_past_customers')
    .eq('holiday_date', today)
    .maybeSingle();

  const runQuarterly = dayOfWeek === 1;
  if (!holidayRow && !runQuarterly) {
    return json({ ok: true, ran: 'nothing', today });
  }

  const { data: users } = await admin.from('users').select('id,email');
  const repList = (users ?? []) as Array<{ id: string; email: string | null }>;

  const results: any[] = [];
  for (const rep of repList) {
    const queued: number[] = [];
    if (holidayRow) {
      const count = await runBlast(admin, rep.id, 'holiday', holidayRow, 30);
      queued.push(count);
    }
    if (runQuarterly) {
      const count = await runBlast(admin, rep.id, 'quarterly_check_in', null, 10);
      queued.push(count);
    }
    const total = queued.reduce((s, n) => s + n, 0);
    if (total > 0) {
      await firePush(admin, rep.id, {
        title: holidayRow ? `${holidayRow.holiday_name} nurtures ready` : 'Quarterly check-ins ready',
        body: `${total} draft${total === 1 ? '' : 's'} waiting in your queue.`,
        data: { route: 'nurture' },
      });
    }
    results.push({ user_id: rep.id, queued: total });
  }

  return json({ ok: true, today, holiday: holidayRow?.holiday_name ?? null, quarterly: runQuarterly, results });
});

async function runBlast(
  admin: ReturnType<typeof createClient>,
  userId: string,
  trigger: 'holiday' | 'quarterly_check_in',
  holiday: any,
  maxPerRep: number,
): Promise<number> {
  const { data: contacts } = await admin
    .from('contacts')
    .select('id,first_name,last_name,heat_score,vehicle,vehicle_make,vehicle_model,last_contact_date,last_contact_summary,lease_end_date,current_mileage,preferred_language,rep_decision,is_past_customer,do_not_contact')
    .eq('user_id', userId)
    .eq('is_deleted', false);
  if (!contacts || contacts.length === 0) return 0;

  const audience = trigger === 'holiday' && holiday
    ? (c: any) => (c.rep_decision === 'dead' || c.rep_decision === 'kill' || c.heat_score < 20 || c.is_past_customer)
    : (c: any) => (c.rep_decision === 'dead' || c.rep_decision === 'kill' || (c.heat_score >= 20 && c.heat_score < 50));

  const candidates = (contacts as any[]).filter(audience).filter(c => !c.do_not_contact);
  if (candidates.length === 0) return 0;

  const ids = candidates.map(c => c.id);
  const { data: history } = await admin
    .from('nurture_messages')
    .select('contact_id,sent_at,reply_received,reply_sentiment,hook_used,created_at')
    .in('contact_id', ids)
    .order('created_at', { ascending: false });

  const hist = new Map<string, { last_nurture: string | null; last_reply: string | null; last_sentiment: string | null; hooks: string[] }>();
  for (const id of ids) hist.set(id, { last_nurture: null, last_reply: null, last_sentiment: null, hooks: [] });
  for (const row of (history ?? []) as any[]) {
    const h = hist.get(row.contact_id);
    if (!h) continue;
    if (row.sent_at && !h.last_nurture) h.last_nurture = row.sent_at;
    if (row.reply_received && !h.last_reply) {
      h.last_reply = row.sent_at ?? row.created_at;
      h.last_sentiment = row.reply_sentiment ?? null;
    }
    if (row.hook_used && h.hooks.length < 3) h.hooks.push(row.hook_used);
  }

  const passing: any[] = [];
  for (const c of candidates) {
    const h = hist.get(c.id)!;
    if (h.last_nurture && daysAgo(h.last_nurture) < 30) continue;
    if (h.last_reply && daysAgo(h.last_reply) < 60) continue;
    if (h.last_sentiment === 'negative' && (!h.last_reply || daysAgo(h.last_reply) < 180)) continue;
    passing.push({ ...c, hooks_to_avoid: h.hooks });
    if (passing.length >= maxPerRep) break;
  }
  if (passing.length === 0) return 0;

  const toneGuidance = trigger === 'holiday' && holiday
    ? `${holiday.holiday_name}: ${holiday.tone_guidance}`
    : 'Quarterly check-in. Light, no agenda. Stay top of mind.';
  const pitchIntensity = trigger === 'holiday' && holiday ? (holiday.pitch_intensity ?? 'low') : 'low';

  const rows = passing.map(c => JSON.stringify({
    id: c.id,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    vehicle_model: c.vehicle_model ?? c.vehicle,
    last_contact_summary: c.last_contact_summary,
    preferred_language: c.preferred_language ?? 'en',
    is_past_customer: c.is_past_customer,
    hooks_to_avoid: c.hooks_to_avoid,
  })).join(',\n');

  const prompt = `You are Rex generating a ${trigger} nurture message for each contact below.

Trigger details:
${toneGuidance}

Pitch intensity: ${pitchIntensity}

For each contact:
1. Acknowledge the trigger in ONE line, then pivot to a personal angle.
2. Hook into ONE of: personal_detail, vehicle_interest, calendar_event, past_purchase, holiday, pricing, inventory, rapport.
3. NEVER use any hook listed in that contact's hooks_to_avoid.
4. Past customers get warmer tone.
5. Spanish rewrite (Mexican slang) if preferred_language is "es".

${REX_COPY_RULES}

CONTACTS:
[
${rows}
]

Return ONLY a single JSON object inside a \`\`\`json fenced block:
{"messages": [{"contact_id": "...", "message": "...", "language": "en"|"es", "hook_used": "...", "char_count": <n>}]}`;

  const messages = await callBrain(prompt);

  const inserts = messages.map((m: any) => ({
    user_id: userId,
    contact_id: String(m.contact_id ?? ''),
    message_text: String(m.message ?? ''),
    language: m.language === 'es' ? 'es' : 'en',
    hook_used: String(m.hook_used ?? 'rapport'),
    trigger_type: trigger,
    pitch_intensity: pitchIntensity,
    scheduled_for: new Date().toISOString(),
    sent_at: null,
  })).filter(r => r.contact_id && r.message_text);

  if (inserts.length === 0) return 0;
  const { error } = await admin.from('nurture_messages').insert(inserts);
  return error ? 0 : inserts.length;
}

async function callBrain(prompt: string): Promise<any[]> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POCKETREP_API_KEY}`,
        'HTTP-Referer': 'https://pocketrep.pro',
        'X-Title': 'PocketRep nurture-scheduler',
      },
      body: JSON.stringify({
        models: BRAIN_MODELS,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2500,
      }),
    });
    if (!res.ok) {
      console.warn('openrouter failed', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '';
    const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
    const obj = JSON.parse((fence ? fence[1] : raw).trim());
    return Array.isArray(obj.messages) ? obj.messages : [];
  } catch (e) {
    console.warn('brain parse failed', e);
    return [];
  }
}

async function firePush(
  admin: ReturnType<typeof createClient>,
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  const { data: tokens } = await admin
    .from('user_push_tokens')
    .select('expo_token')
    .eq('user_id', userId);
  const targets = (tokens ?? []).map((t: any) => t.expo_token).filter(Boolean);
  if (targets.length === 0) return;
  const messages = targets.map((to: string) => ({
    to,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));
  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
