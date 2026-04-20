import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { validateSignature, sendSMS } from '@/lib/twilio';
import { generateReplyDraft } from '@/lib/draft-generator';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;
  const signature = req.headers.get('x-twilio-signature') || '';
  const url = req.nextUrl.origin + req.nextUrl.pathname;

  if (!validateSignature({ signature, url, body: params })) {
    return new Response('invalid signature', { status: 403 });
  }

  const from = params.From;
  const body = params.Body || '';
  const twilioSid = params.MessageSid;

  if (!from) return twiml();

  const supabase = getServerSupabase();

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', from)
    .maybeSingle();

  if (!customer) {
    console.warn('[open-rex] inbound from unknown number', from);
    return twiml();
  }

  await supabase.from('messages').insert({
    customer_id: customer.id,
    direction: 'inbound',
    body,
    twilio_sid: twilioSid,
  });

  try {
    const { appointment } = await generateReplyDraft(customer.id);
    if (appointment && process.env.DEALER_ALERT_PHONE) {
      await sendSMS({
        to: process.env.DEALER_ALERT_PHONE,
        body: `Open Rex: appointment signal from customer ${customer.id}. Check the dashboard.`,
      });
    }
  } catch (e) {
    console.error('[open-rex] reply draft failed', e);
  }

  return twiml();
}

function twiml() {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}
