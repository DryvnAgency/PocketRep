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
  message: string;
  due_date: string;
  channel: 'text' | 'call' | 'email';
  status: 'pending' | 'sent' | 'skipped' | 'saved';
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

function personalizeMessage(template: string | null, contact: any): string {
  const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model]
    .filter(Boolean).join(' ') || 'your vehicle';
  return String(template ?? '')
    .replace(/\{\{first_name\}\}/g, contact.first_name ?? 'there')
    .replace(/\{\{vehicle\}\}/g, vehicle)
    .replace(/\{\{vehicle_make\}\}/g, contact.vehicle_make ?? 'your vehicle')
    .replace(/\{\{last_name\}\}/g, contact.last_name ?? '');
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
export async function markSentAndLog(item: QueueItem, userId: string): Promise<void> {
  const now = new Date().toISOString();

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('contact_sequences')
    .select('id,current_step,started_at,status')
    .eq('user_id', userId)
    .eq('contact_id', item.contact_id)
    .eq('sequence_id', item.sequence_id)
    .maybeSingle();
  if (enrollmentError) throw enrollmentError;

  if (enrollment && enrollment.status === 'active' && enrollment.current_step === item.step_number) {
    const { data: nextStep } = await supabase
      .from('sequence_steps')
      .select('step_number,delay_days')
      .eq('sequence_id', item.sequence_id)
      .eq('step_number', item.step_number + 1)
      .maybeSingle();

    if (nextStep) {
      const nextAt = addDays(enrollment.started_at ?? now, Number(nextStep.delay_days ?? 0)).toISOString();
      const { error } = await supabase
        .from('contact_sequences')
        .update({ current_step: nextStep.step_number, next_step_at: nextAt })
        .eq('id', enrollment.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('contact_sequences')
        .update({ current_step: item.step_number, next_step_at: null, status: 'completed', completed_at: now })
        .eq('id', enrollment.id);
      if (error) throw error;
    }
  }

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
  await markSentAndLog({ ...item, status: 'skipped' }, userId);
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
    .select('id,first_name,last_name,phone,vehicle_year,vehicle_make,vehicle_model,is_deleted,is_demo')
    .in('id', contactIds);
  if (contactError) throw contactError;

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
    items.push({
      sequence_id: enrollment.sequence_id,
      step_number: step.step_number,
      contact_id: contact.id,
      contact_name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim(),
      phone: contact.phone ?? '',
      message: personalizeMessage(step.message_template, contact),
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
