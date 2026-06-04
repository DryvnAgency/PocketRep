// Rex reminders (NEW 3). Backed by public.reminders (RLS: user_id = auth.uid()).
// Created from the coach via the create_reminder action (confirm-before-write),
// surfaced in the notifications bell, and carried forward a day at a time when
// left un-done.
//
// All reads are best-effort: if the migration (20260604_v2_reminders.sql) hasn't
// been applied yet the table is absent, so we swallow errors and return empty
// rather than breaking the notifications inbox.

import { supabase } from '@/lib/supabase';

export type Reminder = {
  id: string;
  contact_id: string | null;
  title: string;
  body: string | null;
  due_at: string; // ISO timestamp
  status: 'pending' | 'done';
};

export async function createReminder(input: {
  title: string;
  dueAt: string; // ISO
  contactId?: string | null;
  body?: string | null;
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: user.id,
      contact_id: input.contactId ?? null,
      title: input.title.trim().slice(0, 200),
      body: input.body?.trim().slice(0, 1000) ?? null,
      due_at: input.dueAt,
      status: 'pending',
      source: 'rex',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

export async function completeReminder(id: string): Promise<void> {
  const { error } = await supabase
    .from('reminders')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Pending reminders that are due now or later today (local), soonest first.
// Future-day reminders stay hidden until their day; rolled-over ones (below)
// land on today and reappear here.
export async function loadDueReminders(): Promise<Reminder[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  try {
    const { data, error } = await supabase
      .from('reminders')
      .select('id,contact_id,title,body,due_at,status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('due_at', endOfToday.toISOString())
      .order('due_at', { ascending: true });
    if (error) return [];
    return (data ?? []) as Reminder[];
  } catch {
    return [];
  }
}

// Carry-over: a pending reminder left un-done past its day rolls forward to the
// same clock time on the next day, repeated until it's no longer on a past day —
// so it keeps nagging "today at 4pm" instead of getting buried. Best-effort;
// runs on notifications load.
export async function rollOverDueReminders(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sot = startOfToday.getTime();
  try {
    const { data, error } = await supabase
      .from('reminders')
      .select('id,due_at,rolled_count')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lt('due_at', startOfToday.toISOString());
    if (error || !data) return;
    for (const r of data as Array<{ id: string; due_at: string; rolled_count: number }>) {
      let due = new Date(r.due_at).getTime();
      let rolls = 0;
      while (due < sot) { due += 86_400_000; rolls++; }
      if (rolls === 0) continue;
      await supabase
        .from('reminders')
        .update({
          due_at: new Date(due).toISOString(),
          rolled_count: (r.rolled_count ?? 0) + rolls,
          updated_at: new Date().toISOString(),
        })
        .eq('id', r.id);
    }
  } catch {
    /* table may not exist yet — ignore */
  }
}
