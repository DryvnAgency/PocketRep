/**
 * PocketRep AI Proxy — Supabase Edge Function
 *
 * Routes:
 *   /ai-proxy/gemini   → Rex Lens (Anthropic Claude via REXLENS_API_KEY)
 *   /ai-proxy/brain    → PocketRep brain (Anthropic Claude Sonnet via _shared/claude.ts)
 *   /ai-proxy/stt      → 501 stub
 *   /ai-proxy/tts      → 501 stub
 *   /ai-proxy           → PocketRep brain (back-compat root)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anthropicMessages, anthropicStream, computeCostCents, MODELS } from '../_shared/claude.ts';

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

// Delegates to the shared Claude backend (_shared/claude.ts) while preserving the
// { json, error } contract the Rex Lens handlers below expect. `data` is the raw
// Anthropic Messages response — identical in shape to the previous inline fetch,
// so the content[].text / usage parsing downstream is unchanged.
async function callClaude(key: string, model: string, max: number, sys: string, user: string): Promise<{ json: any; error?: any }> {
  try {
    const { data } = await anthropicMessages({
      model, maxTokens: max, system: sys,
      messages: [{ role: 'user', content: user }],
      apiKey: key, retries: 1,
    });
    return { json: data };
  } catch (e: unknown) {
    return { json: null, error: { message: e instanceof Error ? e.message : 'Unknown' } };
  }
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
  // The brain now runs on Anthropic Claude (Sonnet, with a Haiku fallback) via
  // the shared backend. Key falls back to REXLENS_API_KEY so no new secret is
  // required. POCKETREP_API_KEY (OpenRouter) is no longer used here.
  const KEY = Deno.env.get('ANTHROPIC_POCKETREP_API_KEY') ?? Deno.env.get('REXLENS_API_KEY');
  if (!KEY) return json({ error: { type: 'server_error', message: 'No Anthropic key (ANTHROPIC_POCKETREP_API_KEY / REXLENS_API_KEY) configured' } }, 500);
  const auth = await authAndPlan(req.headers.get('Authorization'));
  if (auth.error) return auth.error;
  const { user, supabase, today } = auth;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: { type: 'invalid_request', message: 'Invalid JSON' } }, 400); }
  const maxTok = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;

  // Anthropic wants the system prompt OUT of the messages array. Pull any
  // system-role messages (+ a top-level `system`) into one cached system block,
  // and pass only the user/assistant turns as messages.
  const rawMsgs = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const system = [
    typeof body.system === 'string' ? body.system : '',
    ...rawMsgs.filter(m => m.role === 'system').map(m => String(m.content ?? '')),
  ].filter(Boolean).join('\n\n');
  const messages = rawMsgs
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }));

  const record = async (
    usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number },
    model: 'sonnet' | 'haiku',
  ) => {
    const iT = usage.input_tokens ?? 0, oT = usage.output_tokens ?? 0;
    const cost = computeCostCents(usage as any, model);
    try { await supabase!.rpc('increment_daily_usage', { p_user_id: user!.id, p_date: today, p_input_tokens: iT, p_output_tokens: oT, p_cost_cents: cost }); }
    catch { await supabase!.from('daily_ai_usage').upsert({ user_id: user!.id, usage_date: today, input_tokens: iT, output_tokens: oT, cost_cents: cost, request_count: 1, updated_at: new Date().toISOString() }, { onConflict: 'user_id,usage_date' }); }
  };

  // Streaming (opt-in via { stream: true }) — Siri-style token-by-token reply.
  // Anthropic emits event-based SSE; translate it into the OpenAI-shape frames
  // the client already parses (choices[0].delta.content), metering usage from
  // message_start (input) + message_delta (output).
  if (body.stream === true) {
    let upstream: Response;
    try {
      upstream = await anthropicStream({ model: MODELS.sonnet, maxTokens: maxTok, system, messages, apiKey: KEY });
    } catch (e: unknown) {
      return json({ error: { type: 'OVERLOADED', message: 'AI at capacity.', detail: e instanceof Error ? e.message : 'Unknown' } }, 503);
    }
    if (!upstream.ok || !upstream.body) {
      const j = await upstream.json().catch(() => ({}));
      return json({ error: (j as any).error ?? { type: 'upstream_error', message: 'Stream upstream error' } }, upstream.status || 502);
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buf = '';
    let inTok = 0, outTok = 0, cacheRead = 0, cacheWrite = 0;
    const xform = new TransformStream({
      transform(chunk, controller) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? ''; // keep the trailing partial line
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue; // skip "event:" + blank lines
          const d = t.slice(5).trim();
          if (!d) continue;
          try {
            const obj = JSON.parse(d);
            if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
              const text = obj.delta.text ?? '';
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
            } else if (obj.type === 'message_start') {
              const u = obj.message?.usage ?? {};
              inTok = Number(u.input_tokens ?? 0);
              cacheRead = Number(u.cache_read_input_tokens ?? 0);
              cacheWrite = Number(u.cache_creation_input_tokens ?? 0);
            } else if (obj.type === 'message_delta') {
              outTok = Number(obj.usage?.output_tokens ?? outTok);
            }
          } catch { /* partial / non-JSON frame */ }
        }
      },
      async flush(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        if (inTok || outTok) {
          await record({ input_tokens: inTok, output_tokens: outTok, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite }, 'sonnet').catch(() => {});
        }
      },
    });

    return new Response(upstream.body.pipeThrough(xform), {
      status: 200,
      headers: { ...cors(), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }

  // Non-streaming: Sonnet, Haiku fallback. Return the raw Anthropic response —
  // the client's extractContent() already reads content[0].text.
  let result: { data: any; text: string; usage: any };
  let usedModel: 'sonnet' | 'haiku' = 'sonnet';
  try {
    result = await anthropicMessages({ model: MODELS.sonnet, maxTokens: maxTok, system, messages, apiKey: KEY, retries: 2 });
  } catch (_) {
    try {
      result = await anthropicMessages({ model: MODELS.haiku, maxTokens: maxTok, system, messages, apiKey: KEY, retries: 1 });
      usedModel = 'haiku';
    } catch (e2: unknown) {
      return json({ error: { type: 'OVERLOADED', message: 'AI at capacity.', detail: e2 instanceof Error ? e2.message : 'Unknown' } }, 503);
    }
  }
  await record(result.usage, usedModel);
  return json(result.data);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors() });
  if (req.method === 'GET') return json({ status: 'ok', service: 'ai-proxy', brain: MODELS.sonnet, rexlens: REXLENS_DEFAULT_MODEL });
  if (req.method !== 'POST') return json({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  switch (routeOf(req)) {
    case 'rexlens': return handleRexLens(req);
    case 'stt': return json({ error: 'not_implemented', message: 'STT stub' }, 501);
    case 'tts': return json({ error: 'not_implemented', message: 'TTS stub' }, 501);
    case 'brain': case 'root': default: return handleBrain(req);
  }
});
