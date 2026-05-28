/**
 * PocketRep AI Proxy — Supabase Edge Function
 *
 * Routes:
 *   /ai-proxy/gemini   → Rex Lens (Anthropic Claude via REXLENS_API_KEY)
 *   /ai-proxy/brain    → PocketRep brain (OpenRouter via POCKETREP_API_KEY)
 *   /ai-proxy/stt      → 501 stub
 *   /ai-proxy/tts      → 501 stub
 *   /ai-proxy           → PocketRep brain (back-compat root)
 *
 * Deploy:
 *   supabase secrets set REXLENS_API_KEY=sk-ant-...   # Anthropic
 *   supabase secrets set POCKETREP_API_KEY=sk-or-v1-... # OpenRouter
 *   supabase functions deploy ai-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── OpenRouter (PocketRep brain) ────────────────────────────────────────────
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BRAIN_MODELS = ['x-ai/grok-4.3', 'moonshotai/kimi-k2.6'];

// ── Anthropic (Rex Lens) ────────────────────────────────────────────────────
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

// ── Shared ──────────────────────────────────────────────────────────────────
const DAILY_CAP_CENTS: Record<string, number> = {
  rex_lens: 75,
  pro: 75,
  elite: 125,
};
const DEFAULT_CAP_CENTS = 75;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
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

// ── Auth + plan helper ──────────────────────────────────────────────────────
async function authAndPlan(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: jsonResponse({ error: { type: 'auth_error', message: 'Missing authorization' } }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: jsonResponse({ error: { type: 'auth_error', message: 'Invalid or expired token' } }, 401) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, unlimited')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'pro';
  const isUnlimited = profile?.unlimited === true;
  const capCents = DAILY_CAP_CENTS[plan] ?? DEFAULT_CAP_CENTS;
  const today = new Date().toISOString().slice(0, 10);

  if (!isUnlimited) {
    const { data: usage } = await supabase
      .from('daily_ai_usage')
      .select('cost_cents')
      .eq('user_id', user.id)
      .eq('usage_date', today)
      .single();

    const currentCostCents = Number(usage?.cost_cents ?? 0);
    if (currentCostCents >= capCents) {
      return {
        error: jsonResponse({
          error: {
            type: 'DAILY_LIMIT',
            message: `Daily limit reached ($${(capCents / 100).toFixed(2)}/day on your ${plan} plan). Resets at midnight.`,
          },
        }, 429),
      };
    }
  }

  return { user, supabase, today, plan };
}

// ── Rex Lens route (Anthropic Claude) ───────────────────────────────────────

function formatContactForPrompt(task: Record<string, unknown>, repName: string, dealershipName: string): string {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `Today is ${dateStr}. The rep's name is ${repName} and they work at ${dealershipName}.

Contact CRM record:
Name: ${task.customerName || 'unknown'}
Vehicle of Interest: ${task.vehicle || 'not listed'}
Status: ${task.status || 'unknown'}
Source: ${task.source || 'unknown'}
Age: ${task.age || 'unknown'}
Section: ${task.section || 'unknown'}
Task: ${task.taskDescription || 'unknown'}${task.template ? `\nTemplate: ${task.template}` : ''}${task.rawContext ? `\nContext/Notes: ${task.rawContext}` : ''}`;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  maxTokens: number,
  systemText: string,
  userContent: string,
): Promise<{ json: any; error?: any }> {
  const anthropicBody = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userContent }],
    system: [
      { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
    ],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicBody),
      });
      const json = await res.json();
      if (res.ok && !json.error) return { json };
      const retryable = res.status === 429 || res.status === 503 || res.status === 529;
      if (!retryable) return { json: null, error: json.error ?? json };
      if (attempt < 1) await sleep(2000);
    } catch (err: unknown) {
      if (attempt < 1) await sleep(2000);
      else return { json: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  }
  return { json: null, error: { message: 'Retries exhausted' } };
}

async function handleRexLens(req: Request) {
  const REXLENS_API_KEY = Deno.env.get('REXLENS_API_KEY');
  if (!REXLENS_API_KEY) {
    return jsonResponse({ error: { type: 'server_error', message: 'REXLENS_API_KEY not configured' } }, 500);
  }

  const auth = await authAndPlan(req);
  if (auth.error) return auth.error;
  const { user, supabase, today } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { type: 'invalid_request', message: 'Invalid JSON body' } }, 400);
  }

  const model = (body.model as string) || REXLENS_DEFAULT_MODEL;
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 4096;
  const tasks = body.tasks as Array<Record<string, unknown>> | undefined;

  // ── Batch mode: fan out one call per contact ────────────────────────────
  if (tasks && Array.isArray(tasks) && tasks.length > 0) {
    const repName = (body.repName as string) || 'the rep';
    const dealershipName = (body.dealershipName as string) || 'the dealership';

    const promises = tasks.map(task =>
      callAnthropic(
        REXLENS_API_KEY,
        model,
        maxTokens,
        REXLENS_SYSTEM_PROMPT,
        formatContactForPrompt(task, repName, dealershipName),
      )
    );

    const settled = await Promise.allSettled(promises);

    const results: any[] = [];
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheWrite = 0;
    let totalCacheRead = 0;

    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      if (s.status === 'fulfilled' && s.value.json) {
        const text = s.value.json.content?.[0]?.text ?? '';
        try {
          results.push(JSON.parse(text));
        } catch {
          results.push({
            contact: (tasks[i] as any).customerName || null,
            channel: 'call',
            priority_score: 50,
            priority_reason: 'parse error',
            draft: { subject: null, body: text },
            missing_fields: [],
            needs_review: true,
            review_note: 'Could not parse JSON from AI response',
          });
        }
        const u = s.value.json.usage ?? {};
        totalInput += u.input_tokens ?? 0;
        totalOutput += u.output_tokens ?? 0;
        totalCacheWrite += u.cache_creation_input_tokens ?? 0;
        totalCacheRead += u.cache_read_input_tokens ?? 0;
      } else {
        results.push({
          contact: (tasks[i] as any).customerName || null,
          channel: 'call',
          priority_score: 0,
          priority_reason: 'api error',
          draft: { subject: null, body: null },
          missing_fields: [],
          needs_review: true,
          review_note: s.status === 'rejected' ? s.reason?.message : (s.value.error?.message || 'Unknown error'),
        });
      }
    }

    // Cost tracking
    const uncachedInput = Math.max(0, totalInput - totalCacheWrite - totalCacheRead);
    const costUsd = (
      uncachedInput * REXLENS_PRICING.input +
      totalCacheWrite * REXLENS_PRICING.cacheWrite +
      totalCacheRead * REXLENS_PRICING.cacheRead +
      totalOutput * REXLENS_PRICING.output
    ) / 1_000_000;
    const costCents = costUsd * 100;

    try {
      await supabase!.rpc('increment_daily_usage', {
        p_user_id: user!.id,
        p_date: today,
        p_input_tokens: totalInput,
        p_output_tokens: totalOutput,
        p_cost_cents: costCents,
      });
    } catch {
      await supabase!.from('daily_ai_usage').upsert({
        user_id: user!.id, usage_date: today,
        input_tokens: totalInput, output_tokens: totalOutput,
        cost_cents: costCents, request_count: tasks.length,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,usage_date' });
    }

    return jsonResponse({
      content: [{ type: 'text', text: JSON.stringify(results) }],
      usage: {
        input_tokens: totalInput,
        output_tokens: totalOutput,
        cache_creation_input_tokens: totalCacheWrite,
        cache_read_input_tokens: totalCacheRead,
      },
      model,
      batch_size: tasks.length,
    });
  }

  // ── Single mode: pass through as-is (chat, customer detail, etc.) ──────
  const messages = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const systemText = typeof body.system === 'string' && body.system.length > 0
    ? body.system
    : REXLENS_SYSTEM_PROMPT;

  const result = await callAnthropic(REXLENS_API_KEY, model, maxTokens, systemText, messages[0]?.content as string || '');

  if (!result.json) {
    return jsonResponse({
      error: {
        type: 'OVERLOADED',
        message: 'AI is at capacity right now. Try again in 30 seconds.',
        detail: result.error?.message || 'All retries exhausted',
      },
    }, 503);
  }

  const text = result.json.content?.[0]?.text ?? '';
  if (!text) {
    return jsonResponse({ error: { type: 'empty_response', message: 'Claude returned no text', raw: result.json } }, 502);
  }

  const usage = result.json.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const uncachedInput = Math.max(0, inputTokens - cacheWriteTokens - cacheReadTokens);
  const costUsd = (
    uncachedInput * REXLENS_PRICING.input +
    cacheWriteTokens * REXLENS_PRICING.cacheWrite +
    cacheReadTokens * REXLENS_PRICING.cacheRead +
    outputTokens * REXLENS_PRICING.output
  ) / 1_000_000;
  const costCents = costUsd * 100;

  try {
    await supabase!.rpc('increment_daily_usage', {
      p_user_id: user!.id, p_date: today,
      p_input_tokens: inputTokens, p_output_tokens: outputTokens,
      p_cost_cents: costCents,
    });
  } catch {
    await supabase!.from('daily_ai_usage').upsert({
      user_id: user!.id, usage_date: today,
      input_tokens: inputTokens, output_tokens: outputTokens,
      cost_cents: costCents, request_count: 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,usage_date' });
  }

  return jsonResponse({
    content: result.json.content,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWriteTokens, cache_read_input_tokens: cacheReadTokens },
    model: result.json.model || model,
  });
}

// ── PocketRep brain route (OpenRouter) ──────────────────────────────────────
async function handleBrain(req: Request) {
  const POCKETREP_API_KEY = Deno.env.get('POCKETREP_API_KEY');
  if (!POCKETREP_API_KEY) {
    return jsonResponse({ error: { type: 'server_error', message: 'POCKETREP_API_KEY not configured' } }, 500);
  }

  const auth = await authAndPlan(req);
  if (auth.error) return auth.error;
  const { user, supabase, today } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { type: 'invalid_request', message: 'Invalid JSON body' } }, 400);
  }

  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;
  const incomingMessages = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const systemText = typeof body.system === 'string' ? body.system : '';

  const messages = systemText
    ? [{ role: 'system', content: systemText }, ...incomingMessages]
    : incomingMessages;

  const orBody: Record<string, unknown> = {
    models: BRAIN_MODELS,
    messages,
    max_tokens: maxTokens,
    usage: { include: true },
  };

  let apiJson: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${POCKETREP_API_KEY}`,
          'HTTP-Referer': 'https://pocketrep.pro',
          'X-Title': 'PocketRep',
        },
        body: JSON.stringify(orBody),
      });
      const json = await res.json();

      if (res.ok && !json.error && json.choices?.length) {
        apiJson = json;
        break;
      }

      lastError = { status: res.status, error: json.error ?? json };
      const retryable = res.status === 429 || res.status === 503 || (res.status >= 500 && res.status < 600);
      if (!retryable) {
        return jsonResponse({ error: json.error ?? json }, res.status);
      }
      if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
    } catch (err: unknown) {
      lastError = { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
      if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
    }
  }

  if (!apiJson) {
    return jsonResponse({
      error: {
        type: 'OVERLOADED',
        message: 'AI is at capacity right now. Try again in 30 seconds.',
        detail: lastError?.error?.message || 'All retries exhausted',
      },
    }, 503);
  }

  const usage = apiJson.usage ?? {};
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  const costUsd = Number(usage.cost ?? 0);
  const costCents = costUsd * 100;

  try {
    await supabase!.rpc('increment_daily_usage', {
      p_user_id: user!.id,
      p_date: today,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_cost_cents: costCents,
    });
  } catch {
    await supabase!
      .from('daily_ai_usage')
      .upsert(
        {
          user_id: user!.id,
          usage_date: today,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_cents: costCents,
          request_count: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,usage_date' }
      );
  }

  return jsonResponse(apiJson);
}

// ── Main router ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method === 'GET') {
    return jsonResponse({ status: 'ok', service: 'ai-proxy', brain: BRAIN_MODELS, rexlens: REXLENS_DEFAULT_MODEL });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  }

  const route = routeOf(req);

  switch (route) {
    case 'rexlens':
      return handleRexLens(req);
    case 'stt':
      return jsonResponse({ error: 'not_implemented', message: 'Deepgram Nova-3 STT lands in next PR' }, 501);
    case 'tts':
      return jsonResponse({ error: 'not_implemented', message: 'OpenAI gpt-4o-mini-tts lands in next PR' }, 501);
    case 'brain':
    case 'root':
    default:
      return handleBrain(req);
  }
});
