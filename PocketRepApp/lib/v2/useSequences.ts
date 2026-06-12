import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type V2SequenceStep = {
  id: string;
  step_number: number;
  delay_days: number;
  channel: 'text' | 'call' | 'email';
  message_template: string | null;
  ai_personalize: boolean;
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
          .select('id,name,description,sequence_type,is_template,is_custom,is_archived,sequence_steps(id,step_number,delay_days,channel,message_template,ai_personalize)')
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
