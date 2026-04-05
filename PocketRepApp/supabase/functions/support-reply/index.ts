/**
 * PocketRep — Twilio Support Auto-Reply
 *
 * Twilio sends a POST (application/x-www-form-urlencoded) to this URL
 * whenever someone texts the PocketRep support number.
 * We respond with TwiML XML that triggers an instant auto-reply.
 *
 * Setup:
 *  1. Deploy: supabase functions deploy support-reply
 *  2. In Twilio Console → Phone Numbers → your support number
 *     → Messaging → "A message comes in" → Webhook → paste function URL
 *     URL: https://<project-ref>.supabase.co/functions/v1/support-reply
 */

const AUTO_REPLY = `Thanks for reaching out to PocketRep Support! ✅ We received your message and our team will follow up with you shortly. For the fastest response, include your name and what you need help with.`;

Deno.serve(async (req: Request) => {
  // Twilio sends POST; GET can be used for health checks
  if (req.method === 'GET') {
    return new Response('PocketRep support-reply OK', { status: 200 });
  }

  // Return TwiML — Twilio reads this and sends the message back to the user
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${AUTO_REPLY}</Message>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
    },
  });
});
