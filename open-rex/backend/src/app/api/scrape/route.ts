import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { requireBearer } from '@/lib/auth';
import type { ScrapePayload } from '@shared/types';

export async function POST(req: NextRequest) {
  const auth = requireBearer(req);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let payload: ScrapePayload;
  try {
    payload = (await req.json()) as ScrapePayload;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!payload?.customers?.length) {
    return Response.json({ error: 'no customers' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const rows = payload.customers.map((c) => ({
    dealer_id: payload.dealerId,
    platform: payload.platform,
    external_id: c.externalId,
    first_name: c.firstName,
    last_name: c.lastName,
    phone: c.phone,
    email: c.email,
    vehicle: c.vehicle,
    last_contacted_at: c.lastContactedAt,
    status: c.status,
    source: c.source,
    raw_context: c.rawContext,
    scraped_at: payload.scrapedAt,
  }));

  const { error, count } = await supabase
    .from('customers')
    .upsert(rows, { onConflict: 'dealer_id,external_id', count: 'exact' });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, upserted: count ?? rows.length });
}
