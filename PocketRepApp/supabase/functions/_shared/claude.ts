// supabase/functions/_shared/claude.ts
//
// Shared Claude (Anthropic) backend for PocketRep edge functions.
// Imported by ai-proxy (Rex Lens) and nurture-scheduler.
//
// Cost levers built in:
//   1. PROMPT CACHING — the byte-identical system block is cached (~90% off reads).
//   2. TIGHT ROUTING  — per-task model + max_tokens caps (output is the 5x side).
//   3. BATCH API      — submitBatch/getBatchResults for non-latency-sensitive
//                       fan-out at 50% off (available; not yet wired into a caller).
//
// AUTH: reads ANTHROPIC_POCKETREP_API_KEY and falls back to REXLENS_API_KEY
// (both are Anthropic keys), so no new project secret is strictly required to ship.
//
// USAGE ACCOUNTING is intentionally aligned to this repo's LIVE schema:
//   RPC   public.increment_daily_usage(p_user_id, p_date, p_input_tokens,
//                                       p_output_tokens, p_cost_cents)
//   table public.daily_ai_usage(user_id, usage_date, input_tokens,
//                               output_tokens, cost_cents, request_count, updated_at)
// (An earlier draft of this module assumed a bump_ai_usage / daily_ai_usage(day)
//  schema that does NOT exist in production; that path was removed so this module
//  can never fork or break the live AI spend cap.)

const ANTHROPIC_API_KEY =
  Deno.env.get("ANTHROPIC_POCKETREP_API_KEY") ?? Deno.env.get("REXLENS_API_KEY") ?? "";
const API_URL = "https://api.anthropic.com/v1/messages";
const BATCH_URL = "https://api.anthropic.com/v1/messages/batches";
const VERSION = "2023-06-01";

// ---------------------------------------------------------------------------
// 1. MODELS + RATES
// ---------------------------------------------------------------------------
export const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
} as const;

export type ModelKey = keyof typeof MODELS;

// USD per MILLION tokens. cacheWrite = 1.25x base (5-min). cacheRead = 90% off base.
const RATES: Record<ModelKey, {
  input: number; cacheWrite: number; cacheRead: number; output: number;
}> = {
  haiku:  { input: 1.00, cacheWrite: 1.25, cacheRead: 0.10, output: 5.00 },
  sonnet: { input: 3.00, cacheWrite: 3.75, cacheRead: 0.30, output: 15.00 },
};

// ---------------------------------------------------------------------------
// 2. TASK ROUTING (model + a tight max_tokens cap)
// ---------------------------------------------------------------------------
export type Task =
  | "draft"        // short customer text, lowercase, <=280 chars
  | "chat"         // fast Hey Rex turn
  | "coach"        // Coach Mode deep teaching
  | "gameplan"     // per-contact next move
  | "rebuttal"     // objection prep
  | "blast"        // per-contact blast personalization
  | "digest"       // weekly digest
  | "nurture";     // cron drafts

const ROUTING: Record<Task, { model: ModelKey; maxTokens: number }> = {
  draft:    { model: "haiku",  maxTokens: 200 },
  chat:     { model: "haiku",  maxTokens: 500 },
  coach:    { model: "sonnet", maxTokens: 900 },
  gameplan: { model: "sonnet", maxTokens: 700 },
  rebuttal: { model: "sonnet", maxTokens: 500 },
  blast:    { model: "sonnet", maxTokens: 300 },
  digest:   { model: "sonnet", maxTokens: 800 },
  nurture:  { model: "haiku",  maxTokens: 320 },
};

// ---------------------------------------------------------------------------
// 3. COST ACCOUNTING
// ---------------------------------------------------------------------------
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Exact cost in cents from a usage object. Pass batch=true for the 50%-off path. */
export function computeCostCents(usage: Usage, model: ModelKey, batch = false): number {
  const r = RATES[model];
  const usd =
    ((usage.input_tokens || 0) * r.input +
      (usage.cache_creation_input_tokens || 0) * r.cacheWrite +
      (usage.cache_read_input_tokens || 0) * r.cacheRead +
      (usage.output_tokens || 0) * r.output) / 1_000_000;
  return usd * 100 * (batch ? 0.5 : 1);
}

// ---------------------------------------------------------------------------
// 4. CACHED SYSTEM BLOCK
// ---------------------------------------------------------------------------
// CRITICAL for cache hit-rate: `staticSystem` must be BYTE-IDENTICAL on every
// call. Put base instructions + copy rules + canonical few-shots here. Keep
// per-user/per-contact context and the variation seed in the user message.
function systemBlocks(staticSystem: string) {
  return [{ type: "text", text: staticSystem, cache_control: { type: "ephemeral" } }];
}

type Msg = { role: "user" | "assistant"; content: string };

function apiKeyOrThrow(): string {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_POCKETREP_API_KEY (or REXLENS_API_KEY) not configured");
  }
  return ANTHROPIC_API_KEY;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 5. LOW-LEVEL CALL (Anthropic Messages, cached system block, transient retry)
// ---------------------------------------------------------------------------
// Used directly by ai-proxy (Rex Lens passes its own apiKey) and by the
// high-level callClaude() router below.
export async function anthropicMessages(opts: {
  model: string;
  maxTokens: number;
  system: string;
  messages: Msg[];
  apiKey?: string;
  retries?: number; // transient (429/503/529) retries; default 1
}): Promise<{ data: any; text: string; usage: Usage }> {
  const key = opts.apiKey ?? apiKeyOrThrow();
  const retries = opts.retries ?? 1;
  let lastErr: unknown = "unknown error";
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: opts.maxTokens,
          system: systemBlocks(opts.system),
          messages: opts.messages,
        }),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        const text = (data.content || [])
          .filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        return { data, text, usage: (data.usage ?? {}) as Usage };
      }
      lastErr = data.error ?? data;
      // Only 429/503/529 are worth retrying; everything else is terminal.
      if (res.status !== 429 && res.status !== 503 && res.status !== 529) break;
    } catch (e) {
      lastErr = e;
    }
    if (i < retries) await sleep(2000);
  }
  const msg = lastErr instanceof Error ? lastErr.message
    : typeof lastErr === "string" ? lastErr
    : (lastErr as any)?.message ?? JSON.stringify(lastErr);
  throw new Error(`anthropic ${opts.model}: ${msg}`);
}

/**
 * Streaming sibling of anthropicMessages: returns the upstream Anthropic SSE
 * Response (an event stream) so the caller can translate/pipe it. The caller
 * owns parsing Anthropic's event frames (message_start / content_block_delta /
 * message_delta).
 */
export async function anthropicStream(opts: {
  model: string;
  maxTokens: number;
  system: string;
  messages: Msg[];
  apiKey?: string;
}): Promise<Response> {
  const key = opts.apiKey ?? apiKeyOrThrow();
  return await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: systemBlocks(opts.system),
      messages: opts.messages,
      stream: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// 6. HIGH-LEVEL CALL (task-routed, Sonnet -> Haiku fallback)
// ---------------------------------------------------------------------------
export interface CallResult {
  text: string;
  usage: Usage;
  costCents: number;
  modelUsed: ModelKey;
}

export async function callClaude(opts: {
  task: Task;
  staticSystem: string;            // the cached, byte-identical block
  messages: Msg[];                 // variable context lives here
}): Promise<CallResult> {
  const route = ROUTING[opts.task];
  try {
    const { text, usage } = await anthropicMessages({
      model: MODELS[route.model],
      maxTokens: route.maxTokens,
      system: opts.staticSystem,
      messages: opts.messages,
    });
    return { text, usage, costCents: computeCostCents(usage, route.model), modelUsed: route.model };
  } catch (err) {
    // Fallback: a Sonnet task retries once on Haiku before failing.
    if (route.model === "sonnet") {
      const { text, usage } = await anthropicMessages({
        model: MODELS.haiku,
        maxTokens: route.maxTokens,
        system: opts.staticSystem,
        messages: opts.messages,
      });
      return { text, usage, costCents: computeCostCents(usage, "haiku"), modelUsed: "haiku" };
    }
    throw err;
  }
}

/** Append a variation seed to the last user message (keeps system cacheable, kills repetition). */
export function withVariationSeed(messages: Msg[]): Msg[] {
  const seed = crypto.randomUUID().slice(0, 8);
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i] = { ...out[i], content: `${out[i].content}\n[v:${seed}]` };
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. USAGE RECORDING (aligned to the live increment_daily_usage / daily_ai_usage)
// ---------------------------------------------------------------------------
/**
 * Best-effort spend recording for a user: prefers the atomic
 * increment_daily_usage RPC, falls back to an upsert on daily_ai_usage.
 * `supabase` is an already-constructed (service-role) client.
 */
export async function recordUsage(
  supabase: any, userId: string, usage: Usage, model: ModelKey, batch = false,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const iT = usage.input_tokens ?? 0;
  const oT = usage.output_tokens ?? 0;
  const cost = computeCostCents(usage, model, batch);
  try {
    await supabase.rpc("increment_daily_usage", {
      p_user_id: userId, p_date: today, p_input_tokens: iT, p_output_tokens: oT, p_cost_cents: cost,
    });
  } catch {
    await supabase.from("daily_ai_usage").upsert(
      {
        user_id: userId, usage_date: today,
        input_tokens: iT, output_tokens: oT, cost_cents: cost,
        request_count: 1, updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,usage_date" },
    );
  }
}

// ---------------------------------------------------------------------------
// 8. BATCH API (50% off; for non-latency-sensitive fan-out e.g. nurture)
// ---------------------------------------------------------------------------
export interface BatchItem {
  custom_id: string;               // contact_id / message_id
  task: Task;
  staticSystem: string;
  messages: Msg[];
}

/** Submit a batch; returns the batch id to poll. */
export async function submitBatch(items: BatchItem[]): Promise<string> {
  const key = apiKeyOrThrow();
  const requests = items.map((it) => {
    const route = ROUTING[it.task];
    return {
      custom_id: it.custom_id,
      params: {
        model: MODELS[route.model],
        max_tokens: route.maxTokens,
        system: systemBlocks(it.staticSystem),
        messages: it.messages,
      },
    };
  });
  const res = await fetch(BATCH_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": VERSION, "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`batch submit ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

/** Poll a batch. When ended, returns parsed results with batch-rate cost per item. */
export async function getBatchResults(batchId: string, model: ModelKey = "haiku"): Promise<
  { done: boolean; results?: { custom_id: string; text: string; costCents: number }[] }
> {
  const key = apiKeyOrThrow();
  const head = await fetch(`${BATCH_URL}/${batchId}`, {
    headers: { "x-api-key": key, "anthropic-version": VERSION },
  });
  const meta = await head.json();
  if (meta.processing_status !== "ended") return { done: false };

  const out = await fetch(meta.results_url, {
    headers: { "x-api-key": key, "anthropic-version": VERSION },
  });
  const text = await out.text(); // JSONL: one result per line
  const results = text.trim().split("\n").filter(Boolean).map((line) => {
    const row = JSON.parse(line);
    const msg = row.result?.message;
    const body = (msg?.content || [])
      .filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const cost = msg ? computeCostCents(msg.usage, model, true) : 0;
    return { custom_id: row.custom_id, text: body, costCents: cost };
  });
  return { done: true, results };
}
