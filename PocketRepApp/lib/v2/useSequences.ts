import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type V2SequenceStep = {
  id: string;
  step_number: number;
  delay_days: number;
  channel: 'text' | 'call' | 'email';
  message_template: string | null;
  ai_personalize: boolean;
  // True only on a step meant to end in a rep-driven outcome classification
  // (see the "Fresh Up - 14 Day" template's final step). No code in this
  // repo sets contact_sequences.classification automatically — a human
  // picks Sold / Still shopping / No response; this flag only tells a
  // future UI where that prompt belongs.
  requires_classification: boolean;
};

export type V2Sequence = {
  id: string;
  name: string;
  description: string | null;
  sequence_type: 'prospect' | 'sold' | 'custom';
  is_template: boolean;
  is_custom: boolean;
  is_archived: boolean;
  steps: V2SequenceStep[];
  enrolledCount: number;
};

export function useSequences(refetchKey: number = 0) {
  const [sequences, setSequences] = useState<V2Sequence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const [seqRes, enrolRes] = await Promise.all([
        supabase
          .from('sequences')
          .select('id,name,description,sequence_type,is_template,is_custom,is_archived,sequence_steps(id,step_number,delay_days,channel,message_template,ai_personalize,requires_classification)')
          .or(`user_id.eq.${user.id},is_template.eq.true`)
          .eq('is_archived', false)
          .order('name'),
        supabase
          .from('contact_sequences')
          .select('sequence_id,status')
          .eq('user_id', user.id)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;
      if (seqRes.error) {
        // Keep any prior list and surface the error for a Retry affordance.
        setError(seqRes.error.message);
        return;
      }
      setError(null);
      const enrolledByseq: Record<string, number> = {};
      for (const e of enrolRes.data ?? []) {
        enrolledByseq[(e as any).sequence_id] = (enrolledByseq[(e as any).sequence_id] ?? 0) + 1;
      }
      const rows: V2Sequence[] = (seqRes.data ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        sequence_type: s.sequence_type ?? 'custom',
        is_template: !!s.is_template,
        is_custom: !!s.is_custom,
        is_archived: !!s.is_archived,
        steps: (s.sequence_steps ?? []).sort(
          (a: any, b: any) => a.step_number - b.step_number,
        ),
        enrolledCount: enrolledByseq[s.id] ?? 0,
      }));
      setSequences(rows);
    })();
    return () => { cancelled = true; };
  }, [refetchKey, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { sequences, error, reload };
}

// Edit a single step's message template + channel + delay. Returns the
// updated step row.
export async function updateSequenceStep(
  stepId: string,
  patch: { message_template?: string; channel?: 'text' | 'call' | 'email'; delay_days?: number },
): Promise<void> {
  const { error } = await supabase
    .from('sequence_steps')
    .update(patch)
    .eq('id', stepId);
  if (error) throw error;
}

// Rename a sequence.
export async function renameSequence(sequenceId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('sequences')
    .update({ name })
    .eq('id', sequenceId);
  if (error) throw error;
}

// Archive (soft hide). The viewer filters on is_archived=false so archived
// sequences disappear from the list.
export async function archiveSequence(sequenceId: string): Promise<void> {
  const { error } = await supabase
    .from('sequences')
    .update({ is_archived: true })
    .eq('id', sequenceId);
  if (error) throw error;
}

// Enroll a contact in a sequence (P1-R5). Writes a contact_sequences row using
// the existing table — no schema change. Idempotent via the
// (contact_id, sequence_id) unique key: re-enrolling a contact that was
// previously cancelled/completed resets it to active at step 1.
export async function enrollContactInSequence(contactId: string, sequenceId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  // Fail closed before creating/reactivating an enrollment. The send launcher
  // also re-checks DNC, but a blocked customer should never enter the work queue.
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id,do_not_contact,is_deleted')
    .eq('id', contactId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact || contact.is_deleted || contact.do_not_contact) {
    throw new Error('This customer cannot be enrolled because contact is blocked.');
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('contact_sequences')
    .upsert({
      user_id: user.id,
      contact_id: contactId,
      sequence_id: sequenceId,
      current_step: 1,
      status: 'active',
      started_at: now,
      next_step_at: now,
      completed_at: null,
    }, { onConflict: 'contact_id,sequence_id' });
  if (error) throw error;
}
