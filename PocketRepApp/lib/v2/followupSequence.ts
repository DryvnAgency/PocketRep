// DB + brain layer for the new-contact -> recap -> 14-day rep-sent follow-up.
//
// The draft builders/parser live in followupDrafts.ts (pure, testable). Here we add
// the network (an INJECTABLE brain fn — pass a mock in tests for zero live calls)
// and the rex_followups persistence. Everything is best-effort and inert when the
// migration isn't applied (insert/select just error and we surface/swallow it),
// so the feature is safe to ship ahead of activation. NOTHING here sends a message.

import { supabase } from '@/lib/supabase';
import { callBrain, type BrainMessage } from './aiProxy';
import {
  buildRecapPrompt,
  buildFollowupPrompt,
  parseDraft,
  dayLabel,
  type RecapInput,
  type FollowupInput,
} from './followupDrafts';

// Re-export so UI imports the day label from this one module.
export const dayLabelFor = dayLabel;

export type FollowupStatus = 'draft' | 'active' | 'paused' | 'stopped' | 'completed';
export type FollowupDay = { day: number; draft: string; sent_at: string | null; skipped: boolean };
export type Followup = {
  id: string;
  contactId: string;
  status: FollowupStatus;
  totalDays: number;
  currentDay: number;
  recapDraft: string;
  recapSentAt: string | null;
  days: FollowupDay[];
  startedAt: string | null;
};

// A brain call narrowed to what the drafters need. Defaults to the real callBrain;
// tests pass a mock so generateRecapDraft/generateFollowupDraft make no live call.
export type BrainFn = (messages: BrainMessage[], maxTokens: number) => Promise<string>;
const defaultBrain: BrainFn = (messages, maxTokens) => callBrain({ messages, maxTokens, tier: 'flash' });

export async function generateRecapDraft(input: RecapInput, brain: BrainFn = defaultBrain): Promise<string> {
  const raw = await brain([{ role: 'user', content: buildRecapPrompt(input) }], 400);
  return parseDraft(raw);
}

export async function generateFollowupDraft(input: FollowupInput, brain: BrainFn = defaultBrain): Promise<string> {
  const raw = await brain([{ role: 'user', content: buildFollowupPrompt(input) }], 400);
  return parseDraft(raw);
}

function rowToFollowup(r: any): Followup {
  return {
    id: r.id,
    contactId: r.contact_id,
    status: r.status,
    totalDays: Number(r.total_days ?? 14),
    currentDay: Number(r.current_day ?? 0),
    recapDraft: r.recap_draft ?? '',
    recapSentAt: r.recap_sent_at ?? null,
    days: Array.isArray(r.days) ? r.days : [],
    startedAt: r.started_at ?? null,
  };
}

export async function loadFollowup(contactId: string): Promise<Followup | null> {
  const { data, error } = await supabase
    .from('rex_followups')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle();
  // Distinguish a real "no row yet" (null) from a transient/RLS/unapplied-migration
  // error (throw). Collapsing the two would let the UI show the "start a sequence"
  // state for a contact that already has a live run -> a clobber on the next start.
  if (error) throw error;
  if (!data) return null;
  return rowToFollowup(data);
}

// Create (or refresh) the recap draft row for a contact. status stays 'draft' until
// the rep sends the recap. Never resets a sequence that's already past 'draft'.
export async function startRecap(contactId: string, recapDraft: string, totalDays = 14): Promise<Followup | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Guard against clobbering a live run: if a non-draft sequence already exists,
  // leave its progress (current_day/status/sent log) intact.
  const existing = await loadFollowup(contactId);
  if (existing && existing.status !== 'draft') return existing;
  const { data, error } = await supabase
    .from('rex_followups')
    .upsert({
      user_id: user.id,
      contact_id: contactId,
      status: 'draft',
      total_days: totalDays,
      current_day: 0,
      recap_draft: recapDraft,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })
    .select('*')
    .single();
  if (error) throw error;
  return rowToFollowup(data);
}

export async function updateRecapDraft(id: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('rex_followups')
    .update({ recap_draft: text, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// The rep sent the recap from their own composer -> start the daily clock at day 1.
export async function markRecapSent(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('rex_followups')
    .update({ status: 'active', current_day: 1, recap_sent_at: now, started_at: now, updated_at: now })
    .eq('id', id)
    .eq('status', 'draft'); // idempotent: a no-op once the recap has already been sent
  if (error) throw error;
}

// Read-modify-write the days[] jsonb to store a generated draft for a given day.
async function patchDays(id: string, day: number, patch: Partial<FollowupDay>): Promise<void> {
  const { data } = await supabase.from('rex_followups').select('days').eq('id', id).maybeSingle();
  const days: FollowupDay[] = Array.isArray(data?.days) ? data!.days : [];
  const i = days.findIndex(d => d.day === day);
  const base: FollowupDay = i >= 0 ? days[i] : { day, draft: '', sent_at: null, skipped: false };
  const next = { ...base, ...patch };
  if (i >= 0) days[i] = next; else days.push(next);
  const { error } = await supabase
    .from('rex_followups')
    .update({ days, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setDayDraft(id: string, day: number, draft: string): Promise<void> {
  await patchDays(id, day, { draft });
}

// The rep sent day N -> log it and advance. Reaching total_days completes the run.
export async function markDaySent(id: string, day: number, totalDays: number): Promise<void> {
  await patchDays(id, day, { sent_at: new Date().toISOString() });
  const done = day >= totalDays;
  const { error } = await supabase
    .from('rex_followups')
    .update({
      current_day: done ? totalDays : day + 1,
      status: done ? 'completed' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function skipDay(id: string, day: number, totalDays: number): Promise<void> {
  await patchDays(id, day, { skipped: true });
  const done = day >= totalDays;
  const { error } = await supabase
    .from('rex_followups')
    .update({
      current_day: done ? totalDays : day + 1,
      status: done ? 'completed' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function setStatus(id: string, status: FollowupStatus): Promise<void> {
  const { error } = await supabase
    .from('rex_followups')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Fire-and-forget: called from AddContact on save (flag-gated). Drafts the recap
// and stores it; also mirrors a short label into contacts.next_step so the existing
// card shows the pending action. Swallows errors so a new-contact save never fails
// because the brain is slow or the migration isn't applied yet.
export async function kickoffRecapForContact(contactId: string, input: RecapInput): Promise<void> {
  try {
    const draft = await generateRecapDraft(input);
    if (!draft) return;
    await startRecap(contactId, draft);
    await supabase
      .from('contacts')
      .update({ next_step: `Send recap to ${(input.name || '').split(/\s+/)[0] || 'them'}` })
      .eq('id', contactId);
  } catch {
    /* inert until the migration is applied / brain reachable */
  }
}
