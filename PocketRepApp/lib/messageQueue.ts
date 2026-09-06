/**
 * PocketRep — Message Queue
 *
 * Uses contact_sequences as the source of truth for active enrollments.
 * A sequence is a reusable playbook; contact_sequences tracks which contact
 * is on it and which step is currently due. Messages are always review-first:
 * opening SMS/call/email is still a rep action.
 *
 * Batch limit: 50 items/batch by default. Historical 'elite' rows keep 100
 * (backward compat only — no current signup path assigns 'elite'; the
 * current 'pocketrep' plan gets the same 50 every other plan value gets).
 */

import { supabase } from './supabase';
import { getRepSetting } from './v2/repSettings';
import { inferSequenceColor, renderSequenceTemplate } from './v2/sequenceTemplates';
import { logInteraction } from './v2/interactions';
import { logContactTouch, type CallOutcome } from './v2/updateContact';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

const QUEUE_KEY = 'pocketrep_queue_v2';

async function storageGet(key: string): Promise<string | null> {
  if (AsyncStorage) return AsyncStorage.getItem(key);
  if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  return null;
}
async function storageSet(key: string, value: string): Promise<void> {
  if (AsyncStorage) return AsyncStorage.setItem(key, value);
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
}
async function storageRemove(key: string): Promise<void> {
  if (AsyncStorage) return AsyncStorage.removeItem(key);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}

export interface QueueItem {
  sequence_id: string;
  step_number: number;
  contact_id: string;
  contact_name: string;
  phone: string;
  email: string;
  message: string;
  due_date: string;
  channel: 'text' | 'call' | 'email';
  status: 'pending' | 'sent' | 'skipped' | 'saved';
  unresolved_tokens?: string[];
  isDemo?: boolean;
  requires_classification?: boolean;
}

export interface QueueState {
  generated_at: string;
  items: QueueItem[];
  saved_position: number;
}

export type SequenceClassification = 'sold' | 'still_shopping' | 'no_response';

export type PendingSequenceClassification = {
  enrollment_id: string;
  sequence_id: string;
  sequence_name: string;
  contact_id: string;
  contact_name: string;
  classification: null;
};

function addDays(date: string, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function loadQueueState(): Promise<QueueState | null> {
  try {
    const raw = await storageGet(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export async function saveQueueState(state: QueueState): Promise<void> {
  try { await storageSet(QUEUE_KEY, JSON.stringify(state)); } catch {}
}
export async function clearQueueState(): Promise<void> {
  try { await storageRemove(QUEUE_KEY); } catch {}
}

/**
 * Mark the current enrolled step complete and advance the enrollment to the
 * next step. The old implementation wrote a nonexistent per-step sent_at and
 * kept the sent state only in one device's local storage, which caused duplicate
 * sends and broke across devices.
 */
async function advanceEnrollment(
  item: QueueItem,
  userId: string,
): Promise<{ requiresClassification: boolean }> {
  const now = new Date().toISOString();

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('contact_sequences')
    .select('id,current_step,started_at,status')
    .eq('user_id', userId)
    .eq('contact_id', item.contact_id)
    .eq('sequence_id', item.sequence_id)
    .maybeSingle();
  if (enrollmentError) throw enrollmentError;
  if (!enrollment || enrollment.status !== 'active' || enrollment.current_step !== item.step_number) {
    throw new Error('This follow-up was already worked on another device. Refresh the queue.');
  }

  const { data: nextStep, error: nextStepError } = await supabase
    .from('sequence_steps')
    .select('step_number,delay_days')
    .eq('sequence_id', item.sequence_id)
    .eq('step_number', item.step_number + 1)
    .maybeSingle();
  if (nextStepError) throw nextStepError;

  const requiresClassification = !!item.requires_classification && !nextStep;
  const patch = nextStep
    ? {
        current_step: nextStep.step_number,
        next_step_at: addDays(enrollment.started_at ?? now, Number(nextStep.delay_days ?? 0)).toISOString(),
      }
    : {
        current_step: item.step_number,
        next_step_at: null,
        status: 'completed',
        completed_at: now,
        // A classification step is always human-resolved later. Explicitly
        // leave classification null here — never infer Sold/Shopping/No response.
        ...(requiresClassification ? { classification: null } : {}),
      };

  // Optimistic lock: if another device already advanced this exact step,
  // surface the stale queue instead of logging the same action twice.
  const { data: advanced, error: advanceError } = await supabase
    .from('contact_sequences')
    .update(patch)
    .eq('id', enrollment.id)
    .eq('status', 'active')
    .eq('current_step', item.step_number)
    .select('id')
    .maybeSingle();
  if (advanceError) throw advanceError;
  if (!advanced) {
    throw new Error('This follow-up was already worked on another device. Refresh the queue.');
  }
  return { requiresClassification };
}

export async function markSentAndLog(
  item: QueueItem,
  userId: string,
  callOutcome?: CallOutcome,
): Promise<{ requiresClassification: boolean }> {
  if (item.unresolved_tokens?.length) {
    throw new Error('This follow-up still has unresolved template fields.');
  }
  const result = await advanceEnrollment(item, userId);

  const { error: logError } = await supabase.from('contact_interactions').insert({
    user_id: userId,
    contact_id: item.contact_id,
    contact_name: item.contact_name,
    sequence_id: item.sequence_id,
    step_number: item.step_number,
    channel: item.channel,
    message: item.message,
  });
  if (logError) throw logError;

  // The sequence queue must obey the same permanent-memory rule as every other
  // PocketRep action. Update working-state dates, then append the immutable
  // customer timeline event. Texts normally already exist in outbound_sms_actions
  // from launchSms(), so detect that exact recent row and avoid a duplicate.
  const touchMethod = item.channel === 'call' ? 'call' : item.channel === 'email' ? 'email' : 'text';
  await logContactTouch(item.contact_id, touchMethod, item.message, item.channel === 'call' ? callOutcome : undefined);

  let hasAuthoritativeSmsRow = false;
  if (item.channel === 'text') {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: smsRow } = await supabase
      .from('outbound_sms_actions')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_id', item.contact_id)
      .eq('message_body', item.message)
      .eq('status', 'confirmed_sent')
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle();
    hasAuthoritativeSmsRow = !!smsRow;
  }
  if (!hasAuthoritativeSmsRow) {
    await logInteraction(
      item.contact_id,
      touchMethod,
      item.message,
      item.channel === 'call' ? (callOutcome ?? 'completed') : 'confirmed_sent',
    );
  }
  return result;
}

/** Mark the current step skipped and advance exactly like a sent step. */
export async function markSkipped(
  item: QueueItem,
  userId: string,
): Promise<{ requiresClassification: boolean }> {
  return advanceEnrollment(item, userId);
}

/**
 * Recover Fresh Up customers whose final 14-day step is complete but whose
 * outcome has not yet been classified by the rep. This makes the branch prompt
 * durable across refreshes/devices instead of depending on one UI session.
 */
export async function loadPendingSequenceClassifications(
  userId: string,
): Promise<PendingSequenceClassification[]> {
  const { data, error } = await supabase
    .from('contact_sequences')
    .select('id,sequence_id,contact_id,classification,completed_at,sequences!inner(name)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .is('classification', null)
    .eq('sequences.name', 'Fresh Up - 14 Day')
    .order('completed_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Fetch contacts separately instead of depending on a PostgREST relation
  // alias from contact_sequences -> contacts. This keeps the recovery prompt
  // resilient across the repo's known schema/FK naming drift.
  const contactIds = [...new Set(rows.map((row: any) => row.contact_id).filter(Boolean))];
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id,first_name,last_name,is_deleted')
    .in('id', contactIds)
    .eq('user_id', userId)
    .eq('is_deleted', false);
  if (contactsError) throw contactsError;
  const byId = new Map((contacts ?? []).map((row: any) => [row.id, row]));

  return rows
    .filter((row: any) => byId.has(row.contact_id))
    .map((row: any) => {
      const contact: any = byId.get(row.contact_id);
      return {
        enrollment_id: row.id,
        sequence_id: row.sequence_id,
        sequence_name: (row as any).sequences?.name ?? 'Fresh Up - 14 Day',
        contact_id: row.contact_id,
        contact_name: [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Customer',
        classification: null,
      };
    });
}

/**
 * Human-resolve a Fresh Up outcome and branch into the next canonical sequence.
 * No model inference is accepted here — the classification value comes directly
 * from the rep's explicit tap.
 */
export async function classifyAndBranchSequence(
  pending: PendingSequenceClassification,
  classification: SequenceClassification,
  userId: string,
): Promise<void> {
  const destinationName = classification === 'sold'
    ? 'Sold Customer Ownership'
    : 'Unsold Long-Term Follow-Up';

  const { data: destination, error: destinationError } = await supabase
    .from('sequences')
    .select('id,name')
    .eq('is_template', true)
    .eq('name', destinationName)
    .maybeSingle();
  if (destinationError) throw destinationError;
  if (!destination?.id) throw new Error(`${destinationName} is not available yet.`);

  // Optimistic guard: classification must still be unresolved when this tap lands.
  const { data: source, error: sourceError } = await supabase
    .from('contact_sequences')
    .update({ classification })
    .eq('id', pending.enrollment_id)
    .eq('user_id', userId)
    .is('classification', null)
    .select('id')
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source) throw new Error('This sequence outcome was already classified. Refresh the queue.');

  if (classification === 'sold') {
    const { error: soldError } = await supabase
      .from('contacts')
      .update({ is_past_customer: true, updated_at: new Date().toISOString() })
      .eq('id', pending.contact_id)
      .eq('user_id', userId);
    if (soldError) throw soldError;
  }

  const now = new Date().toISOString();
  const { error: enrollError } = await supabase
    .from('contact_sequences')
    .upsert({
      user_id: userId,
      contact_id: pending.contact_id,
      sequence_id: destination.id,
      current_step: 1,
      status: 'active',
      started_at: now,
      next_step_at: now,
      completed_at: null,
      classification: null,
    }, { onConflict: 'contact_id,sequence_id' });
  if (enrollError) throw enrollError;

  const label = classification === 'sold'
    ? 'Sold'
    : classification === 'still_shopping'
      ? 'Still shopping'
      : 'No response';
  await logInteraction(
    pending.contact_id,
    'note',
    `Fresh Up outcome: ${label}. Moved to ${destinationName}.`,
  );
}

/**
 * Generate the actionable queue from active contact enrollments.
 * Only the current step for each enrollment can appear, preventing step 2/3/4
 * from being exposed before step 1 is completed.
 */
export async function generateQueue(userId: string, plan: string): Promise<QueueItem[]> {
  const limit = plan === 'elite' ? 100 : 50;
  const now = new Date();

  const { data: enrollments, error } = await supabase
    .from('contact_sequences')
    .select(`
      id,user_id,contact_id,sequence_id,current_step,status,started_at,next_step_at,
      sequences!inner(id,name,is_archived,sequence_steps(id,step_number,delay_days,channel,message_template,ai_personalize,requires_classification))
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('sequences.is_archived', false)
    .lte('next_step_at', now.toISOString())
    .order('next_step_at', { ascending: true });

  if (error) throw error;
  if (!enrollments?.length) return [];

  const contactIds = [...new Set(enrollments.map((e: any) => e.contact_id))];
  const { data: contacts, error: contactError } = await supabase
    .from('contacts')
    .select('id,first_name,last_name,phone,email,vehicle,trim,trade_in,vehicle_year,vehicle_make,vehicle_model,lease_end_date,is_deleted,do_not_contact,is_demo')
    .in('id', contactIds);
  if (contactError) throw contactError;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const repName = String(profile?.full_name ?? '').trim();
  const dealer = getRepSetting('dealership');

  const contactMap: Record<string, any> = {};
  for (const c of contacts ?? []) contactMap[c.id] = c;

  const items: QueueItem[] = [];
  for (const enrollment of enrollments as any[]) {
    const contact = contactMap[enrollment.contact_id];
    // Fail closed: a contact that is soft-deleted or has opted out must never
    // surface as an actionable queue item, on any channel (call/email are not
    // protected downstream the way launchSms re-checks text sends).
    if (!contact || contact.is_deleted || contact.do_not_contact) continue;

    const steps = (enrollment.sequences?.sequence_steps ?? [])
      .slice()
      .sort((a: any, b: any) => a.step_number - b.step_number);
    const step = steps.find((s: any) => s.step_number === enrollment.current_step);
    if (!step) continue;

    const dueAt = enrollment.next_step_at ?? enrollment.started_at ?? now.toISOString();
    const vehicle = String(contact.vehicle ?? '').trim()
      || [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model].filter(Boolean).join(' ')
      || null;
    // V2 currently stores display color with trim in the form
    // "Gun Metallic · Premium Package" (or "Blue / Premium"). Only infer a
    // color when that delimiter is present; a plain trim must not be mislabeled.
    const color = inferSequenceColor(contact.trim);
    const rendered = renderSequenceTemplate(step.message_template, {
      firstName: contact.first_name,
      lastName: contact.last_name,
      repName,
      dealer,
      vehicle,
      vehicleMake: contact.vehicle_make,
      color,
      trade: contact.trade_in,
      leaseEnd: contact.lease_end_date,
    });
    items.push({
      sequence_id: enrollment.sequence_id,
      step_number: step.step_number,
      contact_id: contact.id,
      contact_name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      message: rendered.message,
      unresolved_tokens: rendered.unresolvedTokens,
      due_date: dueAt.split('T')[0],
      channel: step.channel,
      status: 'pending',
      isDemo: Boolean(contact.is_demo),
      requires_classification: Boolean(step.requires_classification),
    });
    if (items.length >= limit) break;
  }

  items.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return items.slice(0, limit);
}
