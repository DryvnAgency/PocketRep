/**
 * Rex Lens AI Proxy — Supabase Edge Function (Gemini 2.5 Flash)
 *
 * Sits between the Chrome extension and Google's Gemini API.
 * - Verifies JWT auth
 * - Enforces per-plan daily cost caps
 * - Translates Anthropic-style bodies → Gemini format (extension stays unchanged)
 * - Logs usage to daily_ai_usage table
 *
 * Deploy:
 *   supabase secrets set GEMINI_API_KEY=...
 *   supabase functions deploy ai-proxy
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini pricing per 1M tokens (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':      { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
};
const DEFAULT_PRICING = { input: 0.30, output: 2.50 };

// Daily cost cap per plan (in cents)
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

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

function extractText(content: AnthropicMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
}

function anthropicToGemini(body: Record<string, unknown>) {
  const system = typeof body.system === 'string' ? body.system : '';
  const messages = (body.messages as AnthropicMessage[]) || [];
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 2048;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: extractText(m.content) }],
  }));

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system) {
    geminiBody.system_instruction = { parts: [{ text: system }] };
  }
  return geminiBody;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method === 'GET') return jsonResponse({ status: 'ok', service: 'ai-proxy', model: 'gemini-2.5-flash' });
  if (req.method !== 'POST') {
    return jsonResponse({ error: { type: 'invalid_request', message: 'POST required' } }, 405);
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: { type: 'server_error', message: 'GEMINI_API_KEY not configured' } }, 500);
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

  // ── Parse Anthropic-style request ─────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: { type: 'invalid_request', message: 'Invalid JSON body' } }, 400);
  }

  const rawModel = (body.model as string) || 'gemini-2.5-flash';
  // Accept legacy Anthropic model names — map to Gemini
  const model =
    rawModel.startsWith('claude-') || rawModel.startsWith('gemini-')
      ? (rawModel.startsWith('claude-') ? 'gemini-2.5-flash' : rawModel)
      : rawModel;

  const geminiBody = anthropicToGemini(body);

  // ── Call Gemini with retry + fallback on overload ─────────────────────────
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const isOverload = (status: number, errObj: any): boolean => {
    if (status === 429 || status === 503 || status === 529) return true;
    const msg = (errObj?.message || errObj?.status || '').toString().toLowerCase();
    return msg.includes('overload') || msg.includes('high demand') || msg.includes('unavailable') || msg.includes('exhausted') || msg.includes('quota');
  };

  const modelFallbackChain = [model];
  if (model === 'gemini-2.5-flash') modelFallbackChain.push('gemini-2.5-flash-lite');

  let geminiRes: Response | null = null;
  let geminiJson: any = null;
  let lastError: any = null;

  outer: for (const tryModel of modelFallbackChain) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${GEMINI_BASE}/${tryModel}:generateContent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify(geminiBody),
        });
        const json = await res.json();

        if (res.ok && !json.error) {
          geminiRes = res;
          geminiJson = json;
          break outer;
        }

        lastError = { status: res.status, error: json.error ?? json };

        if (!isOverload(res.status, json.error)) {
          // Non-transient error — return immediately
          return jsonResponse({ error: json.error ?? json }, res.status);
        }

        // Transient overload — wait and retry (exponential backoff)
        if (attempt < 2) await sleep(500 * Math.pow(2, attempt));
      } catch (err: unknown) {
        lastError = { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
        if (attempt < 2) await sleep(500 * Math.pow(2, attempt));
      }
    }
    // Exhausted retries on this model — try next fallback
  }

  if (!geminiRes || !geminiJson) {
    return jsonResponse({
      error: {
        type: 'OVERLOADED',
        message: 'AI is at capacity right now. Try again in 30 seconds.',
        detail: lastError?.error?.message || 'All retries and fallbacks exhausted',
      },
    }, 503);
  }

  // ── Extract text + usage ──────────────────────────────────────────────────
  const candidate = geminiJson.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('');

  if (!text) {
    return jsonResponse({ error: { type: 'empty_response', message: 'Gemini returned no text', raw: geminiJson } }, 502);
  }

  const promptTokens = geminiJson.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = geminiJson.usageMetadata?.candidatesTokenCount ?? 0;

  // ── Log usage ─────────────────────────────────────────────────────────────
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  const costUsd = (promptTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  const costCents = costUsd * 100;

  try {
    await supabase.rpc('increment_daily_usage', {
      p_user_id: user.id,
      p_date: today,
      p_input_tokens: promptTokens,
      p_output_tokens: outputTokens,
      p_cost_cents: costCents,
    });
  } catch {
    // Fallback: direct upsert
    await supabase
      .from('daily_ai_usage')
      .upsert(
        {
          user_id: user.id,
          usage_date: today,
          input_tokens: promptTokens,
          output_tokens: outputTokens,
          cost_cents: costCents,
          request_count: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,usage_date' }
      );
  }

  // ── Return in Anthropic-compatible envelope ───────────────────────────────
  return jsonResponse({
    content: [{ type: 'text', text }],
    usage: { input_tokens: promptTokens, output_tokens: outputTokens },
    model,
  });
});
