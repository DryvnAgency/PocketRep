/**
 * Rex Lens AI Proxy — Supabase Edge Function
 *
 * Sits between the Chrome extension and the Anthropic API.
 * - Verifies JWT auth
 * - Enforces per-plan daily cost caps
 * - Logs usage to daily_ai_usage table
 *
 * Deploy:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *   supabase functions deploy ai-proxy
 *
 * URL: https://<project-ref>.supabase.co/functions/v1/ai-proxy/anthropic
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Model pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-sonnet-4-5-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};
const DEFAULT_PRICING = { input: 3.00, output: 15.00 };

// Daily cost cap per plan (in cents)
const DAILY_CAP_CENTS: Record<string, number> = {
  pro: 100,
  elite: 100,
  pro_bundle: 150,
  rex_lens_standalone: 175,
  elite_bundle: 200,
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  if (req.method === 'GET') {
    return jsonResponse({ status: 'ok', service: 'ai-proxy' });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  }

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    return jsonResponse({ error: { type: 'server_error', message: 'API key not configured' } }, 500);
  }

  // ── Auth: extract user from JWT ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Missing authorization' } }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the JWT and get user
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Invalid or expired token' } }, 401);
  }

  // ── Look up plan ─────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'pro';
  const capCents = DAILY_CAP_CENTS[plan] ?? DEFAULT_CAP_CENTS;

  // ── Check daily usage ────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data: usage } = await supabase
    .from('daily_ai_usage')
    .select('cost_cents, request_count')
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

  // ── Forward to Anthropic ─────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { type: 'invalid_request', message: 'Invalid JSON body' } }, 400);
  }

  const model = (body.model as string) || 'claude-sonnet-4-6';

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse({ error: { type: 'proxy_error', message: `Failed to reach Anthropic: ${message}` } }, 502);
  }

  const anthropicJson = await anthropicRes.json();

  // If Anthropic returned an error, pass it through
  if (!anthropicRes.ok || anthropicJson.type === 'error') {
    return jsonResponse(anthropicJson, anthropicRes.status);
  }

  // ── Log usage ────────────────────────────────────────────────────────────
  const inputTokens = anthropicJson.usage?.input_tokens ?? 0;
  const outputTokens = anthropicJson.usage?.output_tokens ?? 0;
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const costCents = costUsd * 100;

  // Upsert: create row if first request today, otherwise increment
  await supabase.rpc('increment_daily_usage', {
    p_user_id: user.id,
    p_date: today,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_cents: costCents,
  }).catch(() => {
    // Non-blocking: don't fail the request if usage logging fails
    // Fallback: try direct upsert
    supabase
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
      )
      .then(() => {});
  });

  // ── Return Anthropic response ────────────────────────────────────────────
  return jsonResponse(anthropicJson);
});
