import { NextRequest } from 'next/server';
import { generateFirstOutreachDraft } from '@/lib/draft-generator';
import { requireBearer } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let payload: { customerIds: string[] };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!Array.isArray(payload.customerIds) || payload.customerIds.length === 0) {
    return Response.json({ error: 'customerIds required' }, { status: 400 });
  }

  const results = await Promise.allSettled(
    payload.customerIds.map((id) => generateFirstOutreachDraft(id))
  );

  const generated = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { id: payload.customerIds[i], reason: String((r as PromiseRejectedResult).reason) } : null))
    .filter(Boolean);

  return Response.json({ ok: true, generated, failed });
}
