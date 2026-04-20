import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { sendSMS } from '@/lib/twilio';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase();

  const { data: draft, error } = await supabase
    .from('drafts')
    .select('id, body, status, customer_id, customers(phone, first_name, last_name)')
    .eq('id', params.id)
    .single();

  if (error || !draft) return Response.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'pending') {
    return Response.json({ error: `draft already ${draft.status}` }, { status: 409 });
  }

  const customer = Array.isArray(draft.customers) ? draft.customers[0] : draft.customers;
  if (!customer?.phone) {
    return Response.json({ error: 'customer phone missing' }, { status: 400 });
  }

  try {
    const { sid } = await sendSMS({ to: customer.phone, body: draft.body });
    await supabase
      .from('drafts')
      .update({
        status: 'sent',
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        twilio_sid: sid,
      })
      .eq('id', params.id);

    await supabase.from('messages').insert({
      customer_id: draft.customer_id,
      direction: 'outbound',
      body: draft.body,
      twilio_sid: sid,
    });

    return Response.json({ ok: true, sid });
  } catch (e) {
    await supabase.from('drafts').update({ status: 'failed' }).eq('id', params.id);
    return Response.json({ error: e instanceof Error ? e.message : 'send failed' }, { status: 500 });
  }
}
