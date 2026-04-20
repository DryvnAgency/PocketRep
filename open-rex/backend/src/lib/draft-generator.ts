import { generateText } from './gemini';
import { getServerSupabase } from './supabase';
import {
  buildFirstOutreachPrompt,
  buildReplyPrompt,
  stripAppointmentSignal,
  validateDraft,
} from '@shared/prompts';
import type { Conversation } from '@shared/types';

const MAX_REGEN_ATTEMPTS = 2;

export async function generateFirstOutreachDraft(customerId: string): Promise<{ draftId: string }> {
  const supabase = getServerSupabase();
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, first_name, vehicle, last_contacted_at')
    .eq('id', customerId)
    .single();

  if (error || !customer) throw new Error(`customer ${customerId} not found`);

  const { system, user } = buildFirstOutreachPrompt({
    firstName: customer.first_name,
    vehicle: customer.vehicle,
    lastContactedAt: customer.last_contacted_at,
  });

  const body = await generateWithValidation(system, user);

  const { data: inserted, error: insertErr } = await supabase
    .from('drafts')
    .insert({
      customer_id: customerId,
      body,
      status: 'pending',
      generated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !inserted) throw new Error(`draft insert failed: ${insertErr?.message}`);
  return { draftId: inserted.id };
}

export async function generateReplyDraft(customerId: string): Promise<{ draftId: string; appointment: boolean }> {
  const supabase = getServerSupabase();

  const [{ data: customer }, { data: messages }] = await Promise.all([
    supabase.from('customers').select('id, first_name, last_name, vehicle').eq('id', customerId).single(),
    supabase
      .from('messages')
      .select('direction, body, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(20),
  ]);

  if (!customer) throw new Error(`customer ${customerId} not found`);

  const conversation: Conversation = {
    customerId,
    customerName: `${customer.first_name} ${customer.last_name}`,
    vehicle: customer.vehicle,
    messages: (messages ?? []).map((m: any) => ({
      direction: m.direction,
      body: m.body,
      timestamp: m.created_at,
    })),
  };

  const { system, user } = buildReplyPrompt(conversation);
  const raw = await generateWithValidation(system, user);
  const { body, isAppointment } = stripAppointmentSignal(raw);

  const { data: inserted, error: insertErr } = await supabase
    .from('drafts')
    .insert({
      customer_id: customerId,
      body,
      status: 'pending',
      generated_at: new Date().toISOString(),
      is_appointment_signal: isAppointment,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) throw new Error(`draft insert failed: ${insertErr?.message}`);
  return { draftId: inserted.id, appointment: isAppointment };
}

async function generateWithValidation(system: string, user: string): Promise<string> {
  let lastViolations: string[] = [];
  for (let attempt = 0; attempt <= MAX_REGEN_ATTEMPTS; attempt++) {
    const userWithFeedback =
      attempt === 0
        ? user
        : `${user}\n\nPrevious attempt violated these rules: ${lastViolations.join('; ')}. Fix them.`;
    const text = await generateText({ system, user: userWithFeedback, temperature: 0.7 });
    const stripped = text.replace(/APPOINTMENT_SIGNAL\s*$/i, '').trim();
    const { ok, violations } = validateDraft(stripped);
    if (ok) return text;
    lastViolations = violations;
  }
  throw new Error(`draft failed validation after ${MAX_REGEN_ATTEMPTS + 1} attempts: ${lastViolations.join('; ')}`);
}
