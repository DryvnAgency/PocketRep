import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { validateDraft } from '@shared/prompts';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let payload: { body: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof payload.body !== 'string' || !payload.body.trim()) {
    return Response.json({ error: 'body required' }, { status: 400 });
  }

  const { ok, violations } = validateDraft(payload.body);
  if (!ok) {
    return Response.json({ error: 'validation failed', violations }, { status: 422 });
  }

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('drafts')
    .update({ body: payload.body })
    .eq('id', params.id)
    .eq('status', 'pending');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
