// Referral Asks (ITEM 2). The post-sale nudge: a few days after a deal is
// logged, draft a short, friendly "know anyone else?" text to the customer and
// drop it into the rep's review queue (nurture_messages, kind='referral_ask',
// sent_at=null). Nothing is ever auto-sent — the rep reviews and sends by hand,
// same as every other nurture draft.
//
// Flow:
//   1. dealLogger.insertDeal() writes a reminders row (source='referral_ask',
//      due_at = now + referral_ask_delay_days) when the deal closes.
//   2. The nurture-scheduler cron (server) processes due reminders daily and
//      inlines the same drafting logic this file implements (it can't import
//      client code from Deno). This module is the client-side equivalent —
//      callable for an in-app pass — and the canonical home of the prompt.
//
// Idempotency: a reminder is claimed (pending -> done) BEFORE the brain call, so
// the cron and an in-app pass can never double-enqueue the same ask. If drafting
// fails the claim is released (done -> pending) so it retries on the next run.

import { supabase } from '@/lib/supabase';
import { REX_COPY_RULES } from './rexActions';
import { callBrain } from './aiProxy';

export const REFERRAL_ASK_KIND = 'referral_ask';
// trigger_type is NOT NULL on nurture_messages; referral asks carry the same
// value there and rely on `kind` as the canonical discriminator.
export const REFERRAL_ASK_TRIGGER = 'referral_ask';

export type ReferralReminder = { id: string; contact_id: string | null };

type ReferralContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  vehicle: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  preferred_language: string | null;
  do_not_contact: boolean | null;
  is_deleted: boolean | null;
};

export type ReferralDraft = {
  nurture_id: string;
  contact_id: string;
  message_text: string;
  language: 'en' | 'es';
};

const CONTACT_COLS =
  'id,first_name,last_name,vehicle,vehicle_make,vehicle_model,preferred_language,do_not_contact,is_deleted';

export function buildReferralAskPrompt(c: ReferralContact): string {
  const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'there';
  const vehicle = [c.vehicle, c.vehicle_make, c.vehicle_model].filter(Boolean).join(' ').trim() || 'their new ride';
  const lang = c.preferred_language === 'es' ? 'es' : 'en';
  return `You are Rex, drafting a short referral-ask text from a car salesperson to a customer who JUST bought a vehicle.

Customer: ${name}
What they bought: ${vehicle}
Preferred language: ${lang}

Goal: thank them warmly for their business, then casually ask if they know anyone (friends, family, coworkers) who might be looking for a car, so you can take care of them too. One warm line, one soft ask. Do NOT offer cash, gift cards, or any incentive. Do NOT be pushy or salesy.

${REX_COPY_RULES}

Return ONLY a single JSON object inside a \`\`\`json fenced block:
{"message": "the draft text", "language": "en" | "es"}`;
}

function parseDraft(raw: string): { message: string; language: 'en' | 'es' | null } {
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  try {
    const obj = JSON.parse((fence ? fence[1] : raw).trim());
    const message = String(obj.message ?? '').trim();
    const language = obj.language === 'es' ? 'es' : obj.language === 'en' ? 'en' : null;
    return { message, language };
  } catch {
    return { message: '', language: null };
  }
}

async function setReminderStatus(id: string, status: 'pending' | 'done'): Promise<void> {
  await supabase
    .from('reminders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
}

// Claim a reminder for processing: flip pending -> done atomically. Returns true
// only for the caller that won the flip (no double-processing across cron/app).
async function claimReminder(id: string): Promise<boolean> {
  const { data } = await supabase
    .from('reminders')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id');
  return !!data && data.length > 0;
}

/**
 * Draft + enqueue a referral ask for one due reminder. Returns the draft, or
 * null if it was skipped (no contact, opted out, already claimed, or the brain
 * call failed). Best-effort and self-contained; never throws.
 */
export async function draftReferralAskForReminder(reminder: ReferralReminder): Promise<ReferralDraft | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    if (!reminder.contact_id) {
      await setReminderStatus(reminder.id, 'done'); // nothing to ask — clear it
      return null;
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select(CONTACT_COLS)
      .eq('id', reminder.contact_id)
      .maybeSingle();
    const c = contact as ReferralContact | null;
    if (!c || c.is_deleted || c.do_not_contact) {
      await setReminderStatus(reminder.id, 'done'); // gone or opted out — clear it
      return null;
    }

    if (!(await claimReminder(reminder.id))) return null; // someone else handled it

    let messageText = '';
    let language: 'en' | 'es' = c.preferred_language === 'es' ? 'es' : 'en';
    try {
      const raw = await callBrain({
        maxTokens: 400,
        messages: [{ role: 'user', content: buildReferralAskPrompt(c) }],
      });
      const parsed = parseDraft(raw);
      messageText = parsed.message;
      if (parsed.language) language = parsed.language;
    } catch {
      await setReminderStatus(reminder.id, 'pending'); // release for retry
      return null;
    }
    if (!messageText) {
      await setReminderStatus(reminder.id, 'pending');
      return null;
    }

    const { data: saved, error } = await supabase
      .from('nurture_messages')
      .insert({
        user_id: user.id,
        contact_id: c.id,
        message_text: messageText,
        language,
        hook_used: null, // referral asks don't participate in nurture hook variety
        trigger_type: REFERRAL_ASK_TRIGGER,
        kind: REFERRAL_ASK_KIND,
        pitch_intensity: 'low',
        scheduled_for: new Date().toISOString(),
        sent_at: null, // queued for review — NEVER auto-sent
      })
      .select('id')
      .single();
    if (error || !saved) {
      await setReminderStatus(reminder.id, 'pending');
      return null;
    }

    return { nurture_id: saved.id as string, contact_id: c.id, message_text: messageText, language };
  } catch {
    return null;
  }
}

/**
 * Process every due referral-ask reminder for the signed-in rep. Cheap when
 * there's nothing due (one indexed query, no brain calls). The cron is the
 * primary driver; this exists for an in-app pass if a surface wants immediacy.
 */
export async function processDueReferralAsks(): Promise<{ drafted: number }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { drafted: 0 };
  const { data } = await supabase
    .from('reminders')
    .select('id,contact_id')
    .eq('user_id', user.id)
    .eq('source', 'referral_ask')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true });

  let drafted = 0;
  for (const r of (data ?? []) as ReferralReminder[]) {
    const d = await draftReferralAskForReminder(r);
    if (d) drafted += 1;
  }
  return { drafted };
}
