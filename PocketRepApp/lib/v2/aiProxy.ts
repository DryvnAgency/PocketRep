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

/**
 * Calls `ai-proxy/brain` with the signed-in user's JWT attached and returns the
 * model's text. Throws `Error('ai-proxy <status>')` on a non-OK response so
 * callers can surface a consistent message.
 */
export async function callBrain(opts: {
  messages: BrainMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('ai-proxy 401');

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
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`ai-proxy ${res.status}`);
  const json = await res.json();
  // The deployed /brain route returns the raw OpenRouter (OpenAI-shape) response
  // — choices[0].message.content. Fall back to the Anthropic shape for the
  // rexlens route / older deployments.
  return (
    json.choices?.[0]?.message?.content ??
    json.content?.[0]?.text ??
    json.text ??
    ''
  ) as string;
}
