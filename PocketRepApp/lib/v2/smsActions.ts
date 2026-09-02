import { supabase } from '@/lib/supabase';

export type SmsActionStatus = 'opened' | 'confirmed_sent' | 'not_sent' | 'failed' | 'no_phone' | 'simulated_sent' | 'blocked_unsafe';
export type SmsActionSource = 'manual' | 'blast' | 'sequence' | 'demo';

export type SmsAction = {
  id: string;
  contactId: string;
  message: string;
  status: SmsActionStatus;
  source: SmsActionSource;
  createdAt: string;
};

/** Record the native SMS composer opening. This is NOT a delivery confirmation. */
export async function recordSmsOpened(input: {
  contactId: string;
  message: string;
  source?: SmsActionSource;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('outbound_sms_actions')
    .insert({
      user_id: user.id,
      contact_id: input.contactId,
      message_body: input.message,
      status: 'opened',
      source: input.source ?? 'manual',
      opened_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/** Mark a previously-opened native SMS as confirmed sent after the rep confirms it. */
export async function markSmsSent(actionId: string): Promise<void> {
  const { error } = await supabase
    .from('outbound_sms_actions')
    .update({ status: 'confirmed_sent', completed_at: new Date().toISOString() })
    .eq('id', actionId);
  if (error) throw error;
}

/** Record that the rep returned without sending the native SMS. */
export async function markSmsNotSent(actionId: string): Promise<void> {
  const { error } = await supabase
    .from('outbound_sms_actions')
    .update({ status: 'not_sent', completed_at: new Date().toISOString() })
    .eq('id', actionId);
  if (error) throw error;
}

/** Record a failed/no-phone/blocked attempt without pretending an SMS was sent. */
export async function recordSmsFailure(input: {
  contactId: string;
  message: string;
  status: 'failed' | 'no_phone' | 'blocked_unsafe';
  source?: SmsActionSource;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('outbound_sms_actions')
    .insert({
      user_id: user.id,
      contact_id: input.contactId,
      message_body: input.message,
      status: input.status,
      source: input.source ?? 'manual',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id ?? null;
}
