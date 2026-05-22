/**
 * PocketRep AI Proxy — Supabase Edge Function
 *
 * Brain: OpenRouter (Grok 4.3 primary → Gemini 3 Flash fallback via models[])
 * STT/TTS: stubbed (501) — Deepgram + OpenAI lands in follow-up PR
 *
 * Routes (POST):
 *   /functions/v1/ai-proxy        → brain (back-compat root)
 *   /functions/v1/ai-proxy/brain  → brain
 *   /functions/v1/ai-proxy/stt    → 501 stub
 *   /functions/v1/ai-proxy/tts    → 501 stub
 *
 * Deploy:
 *   supabase secrets set POCKETREP_API_KEY=sk-or-v1-...   # OpenRouter
 *   supabase functions deploy ai-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const BRAIN_MODELS = ['x-ai/grok-4.3', 'google/gemini-3-flash'];

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

function routeOf(req: Request): 'brain' | 'stt' | 'tts' | 'root' {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (path.endsWith('/brain')) return 'brain';
  if (path.endsWith('/stt')) return 'stt';
  if (path.endsWith('/tts')) return 'tts';
  return 'root';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method === 'GET') {
    return jsonResponse({ status: 'ok', service: 'ai-proxy', brain: BRAIN_MODELS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  }

  const route = routeOf(req);

  if (route === 'stt') {
    return jsonResponse(
      { error: 'not_implemented', message: 'Deepgram Nova-3 STT lands in next PR' },
      501,
    );
  }
  if (route === 'tts') {
    return jsonResponse(
      { error: 'not_implemented', message: 'OpenAI gpt-4o-mini-tts lands in next PR' },
      501,
    );
  }

  const POCKETREP_API_KEY = Deno.env.get('POCKETREP_API_KEY');
  if (!POCKETREP_API_KEY) {
    return jsonResponse(
      { error: { type: 'server_error', message: 'POCKETREP_API_KEY not configured' } },
      500,
    );
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Missing authorization' } }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Invalid or expired token' } }, 401);
  }

  // ── Plan + daily cap ──────────────────────────────────────────────────────
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
      return jsonResponse({
        error: {
          type: 'DAILY_LIMIT',
          message: `Daily limit reached ($${(capCents / 100).toFixed(2)}/day on your ${plan} plan). Resets at midnight.`,
        },
      }, 429);
    }
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { type: 'invalid_request', message: 'Invalid JSON body' } }, 400);
  }

  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;
  const incomingMessages = (body.messages as Array<{ role: string; content: unknown }>) || [];
  const systemText = typeof body.system === 'string' ? body.system : '';

  // OpenAI/OpenRouter shape: system goes inline as the first message
  const messages = systemText
    ? [{ role: 'system', content: systemText }, ...incomingMessages]
    : incomingMessages;

  const orBody: Record<string, unknown> = {
    models: BRAIN_MODELS,
    messages,
    max_tokens: maxTokens,
    usage: { include: true }, // OpenRouter returns usage.cost in USD
  };

  // ── Call OpenRouter ───────────────────────────────────────────────────────
  // OpenRouter handles primary→fallback inside the models[] array. Our retry
  // loop only re-tries on transient network/5xx after that — most failures are
  // already covered by OpenRouter's own routing.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let apiJson: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${POCKETREP_API_KEY}`,
          'HTTP-Referer': 'https://pocketrep.app',
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

  // ── Extract usage + cost ──────────────────────────────────────────────────
  const usage = apiJson.usage ?? {};
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  // OpenRouter returns cost in USD (e.g. 0.000123) when usage.include is true.
  const costUsd = Number(usage.cost ?? 0);
  const costCents = costUsd * 100;

  try {
    await supabase.rpc('increment_daily_usage', {
      p_user_id: user.id,
      p_date: today,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_cost_cents: costCents,
    });
  } catch {
    await supabase
      .from('daily_ai_usage')
      .upsert(
        {
          user_id: user.id,
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

  // ── Return OpenRouter response as-is (OpenAI-shaped) ──────────────────────
  // Includes `model` (the slug that actually served, e.g. x-ai/grok-4.3 or
  // google/gemini-3-flash if Grok failed), `choices`, and `usage` with cost.
  return jsonResponse(apiJson);
});
