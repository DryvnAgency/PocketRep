/**
 * PocketRep — Message Queue
 *
 * Uses contact_sequences as the source of truth for active enrollments.
 * A sequence is a reusable playbook; contact_sequences tracks which contact
 * is on it and which step is currently due. Messages are always review-first:
 * opening SMS/call/email is still a rep action.
 *
 * Plan limits: Pro = 50 items/batch, Elite = 100 items/batch.
 */

import { supabase } from './supabase';
import { getRepSetting } from './v2/repSettings';
import { renderSequenceTemplate } from './v2/sequenceTemplates';

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
}

export interface QueueState {
  generated_at: string;
  items: QueueItem[];
  saved_position: number;
}

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
async function advanceEnrollment(item: QueueItem, userId: string): Promise<void> {
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
}

export async function markSentAndLog(item: QueueItem, userId: string): Promise<void> {
  if (item.unresolved_tokens?.length) {
    throw new Error('This follow-up still has unresolved template fields.');
  }
  await advanceEnrollment(item, userId);

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
}

/** Mark the current step skipped and advance exactly like a sent step. */
export async function markSkipped(item: QueueItem, userId: string): Promise<void> {
  await advanceEnrollment(item, userId);
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
      sequences!inner(id,name,is_archived,sequence_steps(id,step_number,delay_days,channel,message_template,ai_personalize))
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
    .select('id,first_name,last_name,phone,email,vehicle_year,vehicle_make,vehicle_model,lease_end_date,is_deleted,is_demo')
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
    if (!contact || contact.is_deleted) continue;

    const steps = (enrollment.sequences?.sequence_steps ?? [])
      .slice()
      .sort((a: any, b: any) => a.step_number - b.step_number);
    const step = steps.find((s: any) => s.step_number === enrollment.current_step);
    if (!step) continue;

    const dueAt = enrollment.next_step_at ?? enrollment.started_at ?? now.toISOString();
    const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model]
      .filter(Boolean).join(' ') || null;
    const rendered = renderSequenceTemplate(step.message_template, {
      firstName: contact.first_name,
      lastName: contact.last_name,
      repName,
      dealer,
      vehicle,
      vehicleMake: contact.vehicle_make,
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
    });
    if (items.length >= limit) break;
  }

  items.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return items.slice(0, limit);
}
