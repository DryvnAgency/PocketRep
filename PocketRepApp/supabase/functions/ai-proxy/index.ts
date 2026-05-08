/**
 * Rex Lens AI Proxy — Supabase Edge Function (Claude Haiku 4.5)
 *
 * Sits between the Chrome extension and the Anthropic Messages API.
 * - Verifies JWT auth
 * - Enforces per-plan daily cost caps
 * - Adds prompt caching (cache_control on system prompt)
 * - Logs usage to daily_ai_usage table
 *
 * Deploy:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase functions deploy ai-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10 },
};
const DEFAULT_PRICING = { input: 1.00, output: 5.00, cacheWrite: 1.25, cacheRead: 0.10 };

const DAILY_CAP_CENTS: Record<string, number> = {
  rex_lens: 100,
  pro: 100,
  elite: 200,
};
const DEFAULT_CAP_CENTS = 100;

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method === 'GET') return jsonResponse({ status: 'ok', service: 'ai-proxy', model: DEFAULT_MODEL });
  if (req.method !== 'POST') {
    return jsonResponse({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  }

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: { type: 'server_error', message: 'ANTHROPIC_API_KEY not configured' } }, 500);
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

  // ── Plan lookup ───────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, unlimited')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'pro';
  const isUnlimited = profile?.unlimited === true;
  const capCents = DAILY_CAP_CENTS[plan] ?? DEFAULT_CAP_CENTS;

  // ── Daily usage check (skipped for unlimited accounts) ────────────────────
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

  const model = (body.model as string) || DEFAULT_MODEL;
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;
  const messages = (body.messages as Array<{ role: string; content: unknown }>) || [];

  // Build system prompt with prompt caching
  let system: unknown = undefined;
  if (typeof body.system === 'string' && body.system.length > 0) {
    system = [
      { type: 'text', text: body.system, cache_control: { type: 'ephemeral' } },
    ];
  }

  const anthropicBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (system) {
    anthropicBody.system = system;
  }

  // ── Call Anthropic with retry on overload ─────────────────────────────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const isOverload = (status: number, errObj: any): boolean => {
    if (status === 429 || status === 503 || status === 529) return true;
    const msg = typeof errObj === 'string'
      ? errObj.toLowerCase()
      : (errObj?.message || errObj?.type || '').toString().toLowerCase();
    return msg.includes('overload') || msg.includes('rate') || msg.includes('capacity') || msg.includes('unavailable');
  };

  let apiRes: Response | null = null;
  let apiJson: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(anthropicBody),
      });
      const json = await res.json();

      if (res.ok && !json.error) {
        apiRes = res;
        apiJson = json;
        break;
      }

      lastError = { status: res.status, error: json.error ?? json };

      if (!isOverload(res.status, json.error)) {
        return jsonResponse({ error: json.error ?? json }, res.status);
      }

      if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
    } catch (err: unknown) {
      lastError = { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
      if (attempt < 2) await sleep(2000 * Math.pow(2, attempt));
    }
  }

  if (!apiRes || !apiJson) {
    return jsonResponse({
      error: {
        type: 'OVERLOADED',
        message: 'AI is at capacity right now. Try again in 30 seconds.',
        detail: lastError?.error?.message || 'All retries exhausted',
      },
    }, 503);
  }

  // ── Extract text + usage ──────────────────────────────────────────────────
  const text = apiJson.content?.[0]?.text ?? '';

  if (!text) {
    return jsonResponse({ error: { type: 'empty_response', message: 'Claude returned no text', raw: apiJson } }, 502);
  }

  const usage = apiJson.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  // ── Log usage (cache-aware cost) ──────────────────────────────────────────
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const uncachedInput = Math.max(0, inputTokens - cacheWriteTokens - cacheReadTokens);
  const costUsd = (
    uncachedInput * pricing.input +
    cacheWriteTokens * pricing.cacheWrite +
    cacheReadTokens * pricing.cacheRead +
    outputTokens * pricing.output
  ) / 1_000_000;
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

  // ── Return Anthropic-compatible envelope ──────────────────────────────────
  return jsonResponse({
    content: apiJson.content,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheWriteTokens,
      cache_read_input_tokens: cacheReadTokens,
    },
    model,
  });
});
