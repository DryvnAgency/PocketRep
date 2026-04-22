import { supabase } from './supabase';

const AI_PROXY_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

export interface AnthropicBody {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
}

export interface AnthropicResponse {
  content?: Array<{ type: string; text: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: { type: string; message: string };
}

// Call the Supabase Edge Function AI proxy. The proxy accepts Anthropic-shaped
// bodies and translates to Gemini server-side, so call sites don't need to
// change their payload. Auth is the Supabase session JWT — every call counts
// against the user's daily cost cap.
export async function callAnthropicProxy(body: AnthropicBody): Promise<AnthropicResponse | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const res = await fetch(`${AI_PROXY_URL}/anthropic`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  try {
    return await res.json();
  } catch {
    return { error: { type: 'proxy_error', message: `AI proxy returned ${res.status}` } };
  }
}
