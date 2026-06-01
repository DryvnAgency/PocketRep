// Central client for the `ai-proxy/brain` edge function.
//
// The edge function (supabase/functions/ai-proxy/index.ts) rejects any request
// without an `Authorization: Bearer <user JWT>` header with a 401 BEFORE doing
// anything else. Every caller used to POST with only a content-type header,
// which is why every Rex feature failed with "ai-proxy 401". This helper
// attaches the current session's access token (same pattern as
// pushNotifications.ts) so all callers are authenticated.

import { supabase } from '@/lib/supabase';

export const AI_PROXY_URL =
  'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

export type BrainMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

// Two different timeout semantics, so two different ceilings:
//   - Streaming: an *idle* timeout, reset on every chunk via kick(). 20s
//     without a single token is a dead stream. Keeps the voice UX snappy.
//   - One-shot: the *total* budget for the whole request. Batch callers
//     (nurture 2500 tok, blast 2000 tok) plus the edge function's own retry
//     backoff routinely run past 20s, and before this path had a timeout at
//     all they were unbounded — so the one-shot ceiling is generous and acts
//     only as a hang-guard, not a latency cap.
const STREAM_IDLE_TIMEOUT_MS = 20_000;
const ONESHOT_TIMEOUT_MS = 60_000;

type TimeoutHandle = { signal: AbortSignal; kick: () => void; cancel: () => void };

// Builds an AbortSignal that fires after `ms` of inactivity, chained to any
// caller-supplied signal so either source can abort the in-flight fetch.
function withTimeout(external: AbortSignal | undefined, ms: number): TimeoutHandle {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = () => {
    if (timer) clearTimeout(timer);
    // abort() with no reason — DOMException isn't available on every RN engine,
    // and fetch() rejects with an AbortError either way (mapped to a timeout).
    timer = setTimeout(() => { try { ctrl.abort(); } catch { /* ignore */ } }, ms);
  };
  const onExternalAbort = () => ctrl.abort((external as any)?.reason);
  if (external) {
    if (external.aborted) ctrl.abort((external as any).reason);
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  kick();
  const cancel = () => {
    if (timer) clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  };
  return { signal: ctrl.signal, kick, cancel };
}

// Normalizes fetch/abort failures into the stable `ai-proxy <reason>` errors
// callers already surface to the user.
function toBrainError(e: any): Error {
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return new Error('ai-proxy timeout');
  if (e instanceof Error && e.message.startsWith('ai-proxy ')) return e;
  return new Error('ai-proxy network error');
}

// The deployed /brain route returns the raw OpenRouter (OpenAI-shape) response
// — choices[0].message.content. Fall back to the Anthropic shape for the
// rexlens route / older deployments.
function extractContent(json: any): string {
  return (
    json?.choices?.[0]?.message?.content ??
    json?.content?.[0]?.text ??
    json?.text ??
    ''
  ) as string;
}

/**
 * Calls `ai-proxy/brain` with the signed-in user's JWT attached and returns the
 * model's text. Throws `Error('ai-proxy <status|timeout|network error>')` on a
 * non-OK response so callers can surface a consistent message.
 */
export async function callBrain(opts: {
  messages: BrainMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('ai-proxy 401');

  const t = withTimeout(opts.signal, opts.timeoutMs ?? ONESHOT_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_PROXY_URL}/brain`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        max_tokens: opts.maxTokens ?? 800,
        messages: opts.messages,
      }),
      signal: t.signal,
    });

    if (!res.ok) throw new Error(`ai-proxy ${res.status}`);
    return extractContent(await res.json());
  } catch (e) {
    throw toBrainError(e);
  } finally {
    t.cancel();
  }
}

/**
 * Streaming sibling of {@link callBrain}. Requests `stream: true` and invokes
 * `onDelta(fullText, chunk)` as tokens arrive, returning the complete text when
 * done. If the deployed function doesn't stream (no `text/event-stream`
 * response), it transparently falls back to reading the whole JSON body — so
 * callers work both before and after the edge function is redeployed.
 */
export async function callBrainStream(opts: {
  messages: BrainMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  onDelta?: (fullText: string, chunk: string) => void;
}): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('ai-proxy 401');

  const t = withTimeout(opts.signal, opts.timeoutMs ?? STREAM_IDLE_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_PROXY_URL}/brain`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        max_tokens: opts.maxTokens ?? 800,
        messages: opts.messages,
        stream: true,
      }),
      signal: t.signal,
    });

    if (!res.ok) throw new Error(`ai-proxy ${res.status}`);

    const ctype = res.headers.get('content-type') ?? '';
    // Fallback: function hasn't been redeployed with streaming yet → it sent a
    // normal JSON body. Surface it as one final delta so callers still work.
    if (!ctype.includes('text/event-stream') || !res.body) {
      const text = extractContent(await res.json().catch(() => null));
      if (text) opts.onDelta?.(text, text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      t.kick(); // data flowing → reset the idle timeout
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are newline-delimited "data: <json>" lines, terminated by
      // "data: [DONE]". Keep the trailing partial line in the buffer.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          const delta =
            obj.choices?.[0]?.delta?.content ??
            obj.choices?.[0]?.message?.content ??
            '';
          if (delta) {
            full += delta;
            opts.onDelta?.(full, delta);
          }
        } catch {
          /* keep-alive / comment frame — ignore */
        }
      }
    }
    return full;
  } catch (e) {
    throw toBrainError(e);
  } finally {
    t.cancel();
  }
}
