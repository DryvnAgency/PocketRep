import twilio from 'twilio';

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Twilio env missing: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN');
  _client = twilio(sid, token);
  return _client;
}

export async function sendSMS(params: { to: string; body: string }): Promise<{ sid: string }> {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!messagingServiceSid && !from) {
    throw new Error('Twilio env missing: TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
  }
  const msg = await getClient().messages.create({
    to: params.to,
    body: params.body,
    ...(messagingServiceSid ? { messagingServiceSid } : { from: from! }),
  });
  return { sid: msg.sid };
}

export function validateSignature(params: {
  signature: string;
  url: string;
  body: Record<string, string>;
}): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, params.signature, params.url, params.body);
}
