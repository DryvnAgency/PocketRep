import { NextRequest } from 'next/server';
import { generateMassOutreachDrafts } from '@/lib/draft-generator';
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

  try {
    const { generated, failed } = await generateMassOutreachDrafts(payload.customerIds);
    return Response.json({ ok: true, generated, failed });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'generation failed' },
      { status: 500 },
    );
  }
}
