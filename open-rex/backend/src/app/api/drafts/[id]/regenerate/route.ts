import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { generateText, type ImagePart } from '@/lib/gemini';
import { buildRegenerateFromNotesPrompt, validateDraft } from '@shared/prompts';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let payload: { notes?: string; image?: { mimeType: string; dataBase64: string } };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const notes = (payload.notes ?? '').trim();
  if (!notes && !payload.image) {
    return Response.json({ error: 'notes or image required' }, { status: 400 });
  }

  if (payload.image) {
    const bytes = Math.floor((payload.image.dataBase64.length * 3) / 4);
    if (bytes > MAX_IMAGE_BYTES) {
      return Response.json({ error: `image too large (${bytes} > ${MAX_IMAGE_BYTES})` }, { status: 413 });
    }
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(payload.image.mimeType)) {
      return Response.json({ error: 'unsupported image mime type' }, { status: 415 });
    }
  }

  const supabase = getServerSupabase();
  const { data: draft, error: draftErr } = await supabase
    .from('drafts')
    .select('id, customer_id, status, customers(first_name, vehicle)')
    .eq('id', params.id)
    .single();

  if (draftErr || !draft) return Response.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'pending') {
    return Response.json({ error: `draft already ${draft.status}` }, { status: 409 });
  }

  const customer = Array.isArray(draft.customers) ? draft.customers[0] : draft.customers;
  if (!customer?.first_name) {
    return Response.json({ error: 'customer missing' }, { status: 400 });
  }

  const { system, user } = buildRegenerateFromNotesPrompt({
    firstName: customer.first_name,
    vehicle: customer.vehicle,
    repNotes: notes || '(no written notes — generate from image only)',
    hasImage: Boolean(payload.image),
  });

  const images: ImagePart[] = payload.image
    ? [{ mimeType: payload.image.mimeType, dataBase64: payload.image.dataBase64 }]
    : [];

  let body: string | null = null;
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const userPrompt =
      attempt === 0
        ? user
        : `${user}\n\nPrevious attempt violated these rules: ${lastViolations.join('; ')}. Fix them.`;
    const text = await generateText({ system, user: userPrompt, images, temperature: 0.7 });
    const { ok, violations } = validateDraft(text);
    if (ok) {
      body = text;
      break;
    }
    lastViolations = violations;
  }

  if (!body) {
    return Response.json(
      { error: 'generation failed validation', violations: lastViolations },
      { status: 422 },
    );
  }

  await supabase.from('drafts').update({ body, generated_at: new Date().toISOString() }).eq('id', params.id);

  return Response.json({ ok: true, body });
}
