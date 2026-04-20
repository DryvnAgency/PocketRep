export async function GET() {
  return Response.json({
    ok: true,
    service: 'open-rex-backend',
    version: '0.1.0',
    env: {
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      dealerAlertPhone: Boolean(process.env.DEALER_ALERT_PHONE),
    },
  });
}
