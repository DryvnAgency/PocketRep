/**
 * PocketRep AI Proxy — Supabase Edge Function
 *
 * Routes:
 *   /ai-proxy/gemini   → Rex Lens (Anthropic Claude via REXLENS_API_KEY)
 *   /ai-proxy/brain    → PocketRep brain (OpenRouter via POCKETREP_API_KEY)
 *   /ai-proxy/stt      → 501 stub
 *   /ai-proxy/tts      → 501 stub
 *   /ai-proxy           → PocketRep brain (back-compat root)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BRAIN_MODELS = ['x-ai/grok-4.3', 'moonshotai/kimi-k2.6'];

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const REXLENS_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const REXLENS_SYSTEM_PROMPT = `You are Rex Lens, the CRM-reading mode of Rex, a 30-year car-sales veteran helping one rep work their daily worklist. You read one contact's CRM record at a time, figure out what the dealership's CRM is asking the rep to do for that person (call, text, or email), and produce a ready-to-use draft plus a priority score. Plain first person, no corporate jargon, blunt is fine.

INPUT
You receive one contact at a time as a block of extracted CRM data. Fields vary by CRM (VinSolutions, DealerSocket, Elead, DriveCentric, ProMax) and may be incomplete or messy. An image of the record may also be included. Common fields: name, assigned task/action type, task due date, last contact date, last activity note, vehicle of interest, current vehicle / trade, lease or finance status, mileage, phone, email, lead source, status/stage.

STEP 1 — DETERMINE THE TASK CHANNEL
Read the CRM's assigned task for this contact. Map it to one channel:
- If the task names a channel (call / phone, text / SMS, email), use that.
- If no channel is given, infer: a fresh internet lead or quick nudge = text; a stalled deal needing real conversation = call; a document, recap, or longer message = email.
- Output the channel you chose in the "channel" field so the rep knows why.

STEP 2 — EXTRACT WHAT MATTERS
Pull only what you can actually see. Never invent a name, number, date, vehicle, or figure. If a field is missing, leave it null and note it. If the contact name is unreadable or absent, set "needs_review": true and explain.

STEP 3 — DRAFT FOR THE CHANNEL (apply Rex copy rules to text and email body)
COPY RULES (customer-facing drafts only):
Open with "hey" (EN) or "hola" / "que onda" / "que tal" (ES). Never "hi". Never use em-dash, en-dash, or a dash between phrases. Hyphens inside compound words (trade-in, follow-up) are fine. Use commas, periods, line breaks. No bullets or numbered lists inside draft text. No semicolons. Short sentences. Text drafts under 280 characters, 2 to 4 sentences. Close with one of: "let me know if I can help with anything" / "just say the word" / "let me know" / ES: "avisame si te puedo ayudar con algo" / "nomas dime". NEVER end with "no rush", "no pressure", "no hurry". NEVER write: "just checking in", "following up on our last conversation", "hope this finds you well", "I wanted to reach out", "touching base". Spanish is a REWRITE, not a translation. Mexican slang: "carro" not "coche", "chamba", "nomas", "que onda". Trade-ins = "potential equity in your current vehicle". Never "your old car". If data is inferred (mileage, lease end), soften it ("if you're getting close to your cap"). Never fabricate a specific number or date.

By channel:
- text: one SMS draft, all copy rules apply.
- email: a subject line plus a body. Body follows copy rules but may run a little longer (up to ~6 sentences) and may use line breaks for readability. Still no bullets, no dashes, no banned phrases.
- call: NOT a script the customer hears. Produce a Pre-Call Brief for the rep: the one-line reason to call now, the last objection or sticking point, and a Closer's Angle (the specific opener to lead with). This is rep-facing, so copy rules about openers/closes do not apply, but stay blunt and specific. Never fabricate history.

STEP 4 — SCORE PRIORITY (1 to 100, higher = call sooner)
Rank on buying-readiness signals, in rough order of weight: an overdue or due-today CRM task; lease ending soon or mileage near cap; trade equity likely (newer trade, paid-down loan); recent inbound activity then silence; long silence on a past customer due for upgrade. A contact with no actionable signal scores low. Put the single biggest driver in "priority_reason".

OUTPUT — return one JSON object per contact, nothing else:
{
  "contact": "<name or null>",
  "channel": "call" | "text" | "email",
  "priority_score": <1-100>,
  "priority_reason": "<short phrase>",
  "draft": {
    "subject": "<email only, else null>",
    "body": "<the text/email draft, OR the call brief>"
  },
  "missing_fields": ["<field>", ...],
  "needs_review": <true|false>,
  "review_note": "<why, or null>"
}

RULES THAT OVERRIDE EVERYTHING
Never fabricate a contact, number, date, or vehicle. If the record is too thin to act on, return the object with needs_review true and a draft of null rather than guessing. One contact, one JSON object. No prose outside the JSON.`;

const REXLENS_PRICING = { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10 };

const DAILY_CAP_CENTS: Record<string, number> = { rex_lens: 75, pro: 75, elite: 125 };
const DEFAULT_CAP_CENTS = 75;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(), 'Content-Type': 'application/json' } });
}

function routeOf(req: Request): 'rexlens' | 'brain' | 'stt' | 'tts' | 'root' {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (path.endsWith('/gemini') || path.endsWith('/rexlens')) return 'rexlens';
  if (path.endsWith('/brain')) return 'brain';
  if (path.endsWith('/stt')) return 'stt';
  if (path.endsWith('/tts')) return 'tts';
  return 'root';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function authAndPlan(authHeader: string | null) {
  if (!authHeader) return { error: json({ error: { type: 'auth_error', message: 'Missing authorization' } }, 401) };
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return { error: json({ error: { type: 'auth_error', message: 'Invalid or expired token' } }, 401) };
  const { data: profile } = await supabase.from('profiles').select('plan, unlimited').eq('id', user.id).single();
  const plan = profile?.plan || 'pro';
  const isUnlimited = profile?.unlimited === true;
  const capCents = DAILY_CAP_CENTS[plan] ?? DEFAULT_CAP_CENTS;
  const today = new Date().toISOString().slice(0, 10);
  if (!isUnlimited) {
    const { data: usage } = await supabase.from('daily_ai_usage').select('cost_cents').eq('user_id', user.id).eq('usage_date', today).single();
    if (Number(usage?.cost_cents ?? 0) >= capCents) {
      return { error: json({ error: { type: 'DAILY_LIMIT', message: `Daily limit reached ($${(capCents / 100).toFixed(2)}/day). Resets at midnight.` } }, 429) };
    }
  }
  return { user, supabase, today };
}

function fmtContact(task: Record<string, unknown>, rep: string, dealer: string): string {
  const d = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `Today is ${d}. The rep is ${rep} at ${dealer}.\n\nContact CRM record:\nName: ${task.customerName || 'unknown'}\nVehicle: ${task.vehicle || 'not listed'}\nStatus: ${task.status || 'unknown'}\nSource: ${task.source || 'unknown'}\nAge: ${task.age || 'unknown'}\nSection: ${task.section || 'unknown'}\nTask: ${task.taskDescription || 'unknown'}${task.template ? '\nTemplate: ' + task.template : ''}${task.rawContext ? '\nContext: ' + task.rawContext : ''}`;
}

async function callClaude(key: string, model: string, max: number, sys: string, user: string): Promise<{ json: any; error?: any }> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'user', content: user }], system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }] }),
      });
      const j = await r.json();
      if (r.ok && !j.error) return { json: j };
      if (r.status !== 429 && r.status !== 503 && r.status !== 529) return { json: null, error: j.error ?? j };
      if (i < 1) await sleep(2000);
    } catch (e: unknown) {
      if (i < 1) await sleep(2000); else return { json: null, error: { message: e instanceof Error ? e.message : 'Unknown' } };
    }
  }
  return { json: null, error: { message: 'Retries exhausted' } };
}

async function handleRexLens(req: Request) {
  const KEY = Deno.env.get('REXLENS_API_KEY');
  if (!KEY) return json({ error: { type: 'server_error', message: 'REXLENS_API_KEY not configured' } }, 500);
  const auth = await authAndPlan(req.headers.get('Authorization'));
  if (auth.error) return auth.error;
  const { user, supabase, today } = auth;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: { type: 'invalid_request', message: 'Invalid JSON' } }, 400); }
  const model = (body.model as string) || REXLENS_DEFAULT_MODEL;
  const maxTok = typeof body.max_tokens === 'number' ? body.max_tokens : 4096;
  const tasks = body.tasks as Array<Record<string, unknown>> | undefined;

  if (tasks && Array.isArray(tasks) && tasks.length > 0) {
    const rep = (body.repName as string) || 'the rep';
    const dealer = (body.dealershipName as string) || 'the dealership';
    const settled = await Promise.allSettled(tasks.map(t => callClaude(KEY, model, maxTok, REXLENS_SYSTEM_PROMPT, fmtContact(t, rep, dealer))));
    const results: any[] = []; let tIn = 0, tOut = 0, tCW = 0, tCR = 0;
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === 'fulfilled' && s.value.json) {
        const txt = s.value.json.content?.[0]?.text ?? '';
        try { results.push(JSON.parse(txt)); } catch { results.push({ contact: (tasks[i] as any).customerName || null, channel: 'call', priority_score: 50, priority_reason: 'parse error', draft: { subject: null, body: txt }, missing_fields: [], needs_review: true, review_note: 'JSON parse failed' }); }
        const u = s.value.json.usage ?? {}; tIn += u.input_tokens ?? 0; tOut += u.output_tokens ?? 0; tCW += u.cache_creation_input_tokens ?? 0; tCR += u.cache_read_input_tokens ?? 0;
      } else {
        results.push({ contact: (tasks[i] as any).customerName || null, channel: 'call', priority_score: 0, priority_reason: 'api error', draft: { subject: null, body: null }, missing_fields: [], needs_review: true, review_note: s.status === 'rejected' ? s.reason?.message : (s.value.error?.message || 'Unknown') });
      }
    }
    const uncached = Math.max(0, tIn - tCW - tCR);
    const cost = (uncached * REXLENS_PRICING.input + tCW * REXLENS_PRICING.cacheWrite + tCR * REXLENS_PRICING.cacheRead + tOut * REXLENS_PRICING.output) / 1e6 * 100;
    try { await supabase!.rpc('increment_daily_usage', { p_user_id: user!.id, p_date: today, p_input_tokens: tIn, p_output_tokens: tOut, p_cost_cents: cost }); } catch { await supabase!.from('daily_ai_usage').upsert({ user_id: user!.id, usage_date: today, input_tokens: tIn, output_tokens: tOut, cost_cents: cost, request_count: tasks.length, updated_at: new Date().toISOString() }, { onConflict: 'user_id,usage_date' }); }
    return json({ content: [{ type: 'text', text: JSON.stringify(results) }], usage: { input_tokens: tIn, output_tokens: tOut, cache_creation_input_tokens: tCW, cache_read_input_tokens: tCR }, model, batch_size: tasks.length });
  }

  const messages = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const sys = typeof body.system === 'string' && body.system.length > 0 ? body.system : REXLENS_SYSTEM_PROMPT;
  const r = await callClaude(KEY, model, maxTok, sys, (messages[0]?.content as string) || '');
  if (!r.json) return json({ error: { type: 'OVERLOADED', message: 'AI at capacity. Try again in 30s.', detail: r.error?.message } }, 503);
  const txt = r.json.content?.[0]?.text ?? '';
  if (!txt) return json({ error: { type: 'empty_response', message: 'No text returned' } }, 502);
  const u = r.json.usage ?? {};
  const iT = u.input_tokens ?? 0, oT = u.output_tokens ?? 0, cW = u.cache_creation_input_tokens ?? 0, cR = u.cache_read_input_tokens ?? 0;
  const cost = (Math.max(0, iT - cW - cR) * REXLENS_PRICING.input + cW * REXLENS_PRICING.cacheWrite + cR * REXLENS_PRICING.cacheRead + oT * REXLENS_PRICING.output) / 1e6 * 100;
  try { await supabase!.rpc('increment_daily_usage', { p_user_id: user!.id, p_date: today, p_input_tokens: iT, p_output_tokens: oT, p_cost_cents: cost }); } catch { await supabase!.from('daily_ai_usage').upsert({ user_id: user!.id, usage_date: today, input_tokens: iT, output_tokens: oT, cost_cents: cost, request_count: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,usage_date' }); }
  return json({ content: r.json.content, usage: { input_tokens: iT, output_tokens: oT, cache_creation_input_tokens: cW, cache_read_input_tokens: cR }, model: r.json.model || model });
}

async function handleBrain(req: Request) {
  const KEY = Deno.env.get('POCKETREP_API_KEY');
  if (!KEY) return json({ error: { type: 'server_error', message: 'POCKETREP_API_KEY not configured' } }, 500);
  const auth = await authAndPlan(req.headers.get('Authorization'));
  if (auth.error) return auth.error;
  const { user, supabase, today } = auth;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: { type: 'invalid_request', message: 'Invalid JSON' } }, 400); }
  const maxTok = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;
  const msgs = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const sys = typeof body.system === 'string' ? body.system : '';
  const messages = sys ? [{ role: 'system', content: sys }, ...msgs] : msgs;

  // Streaming passthrough (opt-in via { stream: true }). Pipe OpenRouter's SSE
  // straight to the client for a Siri-style token-by-token reply, teeing the
  // frames so usage/cost is still recorded from the final chunk. Existing
  // non-streaming callers (gamePlan, blast, nurture, digest, stalled) never set
  // stream, so they're unaffected.
  if (body.stream === true) {
    let upstream: Response;
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'HTTP-Referer': 'https://pocketrep.pro', 'X-Title': 'PocketRep' },
        body: JSON.stringify({ models: BRAIN_MODELS, messages, max_tokens: maxTok, stream: true, usage: { include: true } }),
      });
    } catch (e: unknown) {
      return json({ error: { type: 'OVERLOADED', message: 'AI at capacity.', detail: e instanceof Error ? e.message : 'Unknown' } }, 503);
    }
    if (!upstream.ok || !upstream.body) {
      const j = await upstream.json().catch(() => ({}));
      return json({ error: (j as any).error ?? { type: 'upstream_error', message: 'Stream upstream error' } }, upstream.status || 502);
    }

    const decoder = new TextDecoder();
    let sseBuf = '';
    const meter = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk); // deliver untouched, immediately
        try { sseBuf += decoder.decode(chunk, { stream: true }); } catch { /* ignore */ }
      },
      async flush() {
        try {
          let iT = 0, oT = 0, cost = 0;
          for (const line of sseBuf.split('\n')) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const d = t.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            try {
              const obj = JSON.parse(d);
              if (obj.usage) {
                iT = Number(obj.usage.prompt_tokens ?? 0);
                oT = Number(obj.usage.completion_tokens ?? 0);
                cost = Number(obj.usage.cost ?? 0) * 100;
              }
            } catch { /* partial / non-JSON frame */ }
          }
          if (iT || oT || cost) {
            try { await supabase!.rpc('increment_daily_usage', { p_user_id: user!.id, p_date: today, p_input_tokens: iT, p_output_tokens: oT, p_cost_cents: cost }); }
            catch { await supabase!.from('daily_ai_usage').upsert({ user_id: user!.id, usage_date: today, input_tokens: iT, output_tokens: oT, cost_cents: cost, request_count: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,usage_date' }); }
          }
        } catch { /* usage metering is best-effort */ }
      },
    });

    return new Response(upstream.body.pipeThrough(meter), {
      status: 200,
      headers: { ...cors(), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  let apiJson: any = null; let lastErr: any = null;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(OPENROUTER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'HTTP-Referer': 'https://pocketrep.pro', 'X-Title': 'PocketRep' }, body: JSON.stringify({ models: BRAIN_MODELS, messages, max_tokens: maxTok, usage: { include: true } }) });
      const j = await r.json();
      if (r.ok && !j.error && j.choices?.length) { apiJson = j; break; }
      lastErr = { status: r.status, error: j.error ?? j };
      if (!(r.status === 429 || r.status === 503 || r.status >= 500)) return json({ error: j.error ?? j }, r.status);
      if (i < 2) await sleep(2000 * Math.pow(2, i));
    } catch (e: unknown) { lastErr = { error: { message: e instanceof Error ? e.message : 'Unknown' } }; if (i < 2) await sleep(2000 * Math.pow(2, i)); }
  }
  if (!apiJson) return json({ error: { type: 'OVERLOADED', message: 'AI at capacity.', detail: lastErr?.error?.message } }, 503);
  const u = apiJson.usage ?? {}; const iT = Number(u.prompt_tokens ?? 0); const oT = Number(u.completion_tokens ?? 0); const cost = Number(u.cost ?? 0) * 100;
  try { await supabase!.rpc('increment_daily_usage', { p_user_id: user!.id, p_date: today, p_input_tokens: iT, p_output_tokens: oT, p_cost_cents: cost }); } catch { await supabase!.from('daily_ai_usage').upsert({ user_id: user!.id, usage_date: today, input_tokens: iT, output_tokens: oT, cost_cents: cost, request_count: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,usage_date' }); }
  return json(apiJson);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method === 'GET') return json({ status: 'ok', service: 'ai-proxy', brain: BRAIN_MODELS, rexlens: REXLENS_DEFAULT_MODEL });
  if (req.method !== 'POST') return json({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  switch (routeOf(req)) {
    case 'rexlens': return handleRexLens(req);
    case 'stt': return json({ error: 'not_implemented', message: 'STT stub' }, 501);
    case 'tts': return json({ error: 'not_implemented', message: 'TTS stub' }, 501);
    case 'brain': case 'root': default: return handleBrain(req);
  }
});
