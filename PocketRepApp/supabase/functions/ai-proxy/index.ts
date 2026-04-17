import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const PLAN_DAILY_CAPS: Record<string, number> = {
  pro: 100,
  elite: 100,
  pro_bundle: 150,
  rex_lens_standalone: 175,
  elite_bundle: 200,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function getUserFromAuth(req: Request): Promise<{ userId: string; plan: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  return { userId: user.id, plan: profile?.plan || 'pro' };
}

async function checkAndIncrementUsage(userId: string, plan: string): Promise<boolean> {
  const cap = PLAN_DAILY_CAPS[plan] ?? PLAN_DAILY_CAPS.pro;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().split('T')[0];

  const { data: usage } = await supabase
    .from('daily_ai_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .single();

  const currentCount = usage?.request_count ?? 0;
  if (currentCount >= cap) return false;

  await supabase.rpc('increment_daily_usage', {
    p_user_id: userId,
    p_input_tokens: 0,
    p_output_tokens: 0,
    p_cost_cents: 0,
  });

  return true;
}

async function handleGemini(req: Request): Promise<Response> {
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: { type: 'config_error', message: 'GEMINI_API_KEY not configured' } }, 500);
  }

  const user = await getUserFromAuth(req);
  if (!user) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Authentication required' } }, 401);
  }

  const allowed = await checkAndIncrementUsage(user.userId, user.plan);
  if (!allowed) {
    return jsonResponse({ type: 'error', error: { type: 'DAILY_LIMIT', message: 'Daily AI limit reached. Resets at midnight.' } }, 429);
  }

  const body = await req.json();
  const { model, max_tokens, system, messages } = body;

  const geminiModel = model || 'gemini-2.5-flash';

  const contents = (messages || []).map((m: { role: string; content: string }) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: max_tokens || 1500,
    },
  };

  if (system) {
    geminiBody.systemInstruction = { parts: [{ text: system }] };
  }

  const url = `${GEMINI_BASE}/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;

  const geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  });

  const geminiJson = await geminiRes.json();

  if (!geminiRes.ok || geminiJson.error) {
    const errMsg = geminiJson.error?.message || JSON.stringify(geminiJson.error || geminiJson);
    return jsonResponse({ type: 'error', error: { type: 'api_error', message: errMsg } }, geminiRes.status || 500);
  }

  const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text === undefined || text === null) {
    return jsonResponse({ type: 'error', error: { type: 'empty_response', message: 'Gemini returned no content' } }, 502);
  }

  return jsonResponse({ content: [{ text }] });
}

async function handleWhisper(req: Request): Promise<Response> {
  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: { type: 'config_error', message: 'OPENAI_API_KEY not configured' } }, 500);
  }

  const user = await getUserFromAuth(req);
  if (!user) {
    return jsonResponse({ error: { type: 'auth_error', message: 'Authentication required' } }, 401);
  }

  const formData = await req.formData();
  const audioFile = formData.get('file');
  if (!audioFile) {
    return jsonResponse({ error: { type: 'bad_request', message: 'No audio file provided' } }, 400);
  }

  const whisperForm = new FormData();
  whisperForm.append('file', audioFile);
  whisperForm.append('model', 'whisper-1');

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: whisperForm,
  });

  const whisperJson = await whisperRes.json();
  return jsonResponse(whisperJson, whisperRes.status);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  if (req.method === 'GET') {
    return new Response('ai-proxy OK', { status: 200, headers: CORS_HEADERS });
  }

  try {
    if (path === 'gemini') {
      return await handleGemini(req);
    } else if (path === 'whisper') {
      return await handleWhisper(req);
    } else if (path === 'anthropic') {
      return jsonResponse({ type: 'error', error: { type: 'deprecated', message: 'Anthropic endpoint deprecated. Use /gemini.' } }, 410);
    } else {
      return await handleGemini(req);
    }
  } catch (err: any) {
    return jsonResponse({ type: 'error', error: { type: 'internal_error', message: err.message || 'Unknown error' } }, 500);
  }
});
