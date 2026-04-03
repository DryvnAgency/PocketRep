/**
 * PocketRep — Message Queue
 *
 * Scans all contact-linked sequences for steps that are due today or past due.
 * Generates fully-personalized messages ({{first_name}}, {{vehicle}} replaced).
 * Stores queue state in AsyncStorage so reps can save & resume mid-batch.
 *
 * Plan limits: Pro = 50 items/batch, Elite = 100 items/batch.
 */

import { supabase } from './supabase';

let AsyncStorage: any = null;
try { AsyncStorage = require('@react-native-async-storage/async-storage').default; } catch {}

const QUEUE_KEY = 'pocketrep_queue_v2';
const SENT_KEY = 'pocketrep_sent_v1';

export interface QueueItem {
  sequence_id: string;
  step_number: number;
  contact_id: string;
  contact_name: string;
  phone: string;
  message: string;          // fully personalized
  due_date: string;         // ISO date
  channel: 'text' | 'call' | 'email';
  status: 'pending' | 'sent' | 'skipped' | 'saved';
}

export interface QueueState {
  generated_at: string;
  items: QueueItem[];
  saved_position: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

function personalizeMessage(template: string, contact: any): string {
  const vehicle = [contact.vehicle_year, contact.vehicle_make, contact.vehicle_model]
    .filter(Boolean).join(' ') || 'your vehicle';
  return template
    .replace(/\{\{first_name\}\}/g, contact.first_name ?? 'there')
    .replace(/\{\{vehicle\}\}/g, vehicle)
    .replace(/\{\{vehicle_make\}\}/g, contact.vehicle_make ?? 'your vehicle')
    .replace(/\{\{last_name\}\}/g, contact.last_name ?? '');
}

// ── Sent tracking ─────────────────────────────────────────────────────────────

async function loadSentSet(): Promise<Set<string>> {
  if (!AsyncStorage) return new Set();
  try {
    const raw = await AsyncStorage.getItem(SENT_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

export async function markSent(sequenceId: string, stepNumber: number): Promise<void> {
  if (!AsyncStorage) return;
  try {
    const set = await loadSentSet();
    set.add(`${sequenceId}_step${stepNumber}`);
    await AsyncStorage.setItem(SENT_KEY, JSON.stringify([...set]));
  } catch {}
}

// ── Queue persistence ─────────────────────────────────────────────────────────

export async function loadQueueState(): Promise<QueueState | null> {
  if (!AsyncStorage) return null;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveQueueState(state: QueueState): Promise<void> {
  if (!AsyncStorage) return;
  try { await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(state)); } catch {}
}

export async function clearQueueState(): Promise<void> {
  if (!AsyncStorage) return;
  try { await AsyncStorage.removeItem(QUEUE_KEY); } catch {}
}

// ── Main: generate a fresh queue ─────────────────────────────────────────────

export async function generateQueue(
  userId: string,
  plan: string,
): Promise<QueueItem[]> {
  const limit = plan === 'elite' ? 100 : 50;
  const today = new Date();
  today.setHours(23, 59, 59, 0);

  // Load all sequences with steps that are linked to a contact
  const { data: sequences } = await supabase
    .from('sequences')
    .select('id, created_at, contact_id, sequence_steps(*)')
    .eq('user_id', userId)
    .not('contact_id', 'is', null);

  if (!sequences || sequences.length === 0) return [];

  // Load all relevant contacts in one query
  const contactIds = [...new Set(sequences.map((s: any) => s.contact_id))];
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, vehicle_year, vehicle_make, vehicle_model')
    .in('id', contactIds);

  const contactMap: Record<string, any> = {};
  for (const c of contacts ?? []) contactMap[c.id] = c;

  const sentSet = await loadSentSet();
  const items: QueueItem[] = [];

  for (const seq of sequences as any[]) {
    const contact = contactMap[seq.contact_id];
    if (!contact) continue;

    const steps = (seq.sequence_steps ?? []).sort((a: any, b: any) => a.step_number - b.step_number);

    for (const step of steps) {
      const sentKey = `${seq.id}_step${step.step_number}`;
      if (sentSet.has(sentKey)) continue;

      const dueDate = addDays(seq.created_at, step.delay_days);
      if (dueDate > today) continue;

      // Only text steps go in the queue (call/email are coaching notes, not sendable texts)
      // But we include calls as "coaching reminders" with a different CTA
      items.push({
        sequence_id: seq.id,
        step_number: step.step_number,
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name}`.trim(),
        phone: contact.phone ?? '',
        message: personalizeMessage(step.message_template, contact),
        due_date: dueDate.toISOString().split('T')[0],
        channel: step.channel,
        status: 'pending',
      });

      if (items.length >= limit) break;
    }
    if (items.length >= limit) break;
  }

  // Sort oldest-due first
  items.sort((a, b) => a.due_date.localeCompare(b.due_date));

  return items.slice(0, limit);
}
