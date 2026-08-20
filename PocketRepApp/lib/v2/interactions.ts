import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// A single entry in a contact's activity timeline. Write-side entries go to
// public.interactions; the read-side useInteractions queries the unified
// public.contact_timeline view.
export type InteractionType = 'call' | 'text' | 'email' | 'note';

export type TimelineEventType =
  | InteractionType
  | 'nurture'
  | 'reply'
  | 'referral_ask'
  | string;

export type Interaction = {
  id: string;
  type: TimelineEventType;
  notes: string | null;
  outcome: string | null;
  interactionDate: string;
  source: 'interaction' | 'sequence_step' | 'nurture' | 'reply' | 'sms_action';
};

export async function logInteraction(
  contactId: string,
  type: InteractionType,
  notes?: string | null,
  outcome?: string | null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const trimmed = notes?.trim();
  const { error } = await supabase.from('interactions').insert({
    user_id: user.id,
    contact_id: contactId,
    type,
    notes: trimmed ? trimmed.slice(0, 1000) : null,
    outcome: outcome ?? null,
  });
  if (error) throw error;
}

export function useInteractions(
  contactId: string | null,
  refetchKey: number = 0,
): Interaction[] {
  const [rows, setRows] = useState<Interaction[]>([]);

  useEffect(() => {
    if (!contactId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('contact_timeline')
      .select('id,event_type,notes,outcome,event_date,source')
      .eq('contact_id', contactId)
      .order('event_date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('useInteractions: failed to load timeline', error);
          return;
        }
        setRows(
          ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            type: r.event_type as TimelineEventType,
            notes: r.notes,
            outcome: r.outcome,
            interactionDate: r.event_date,
            source: r.source,
          })),
        );
      });
    return () => { cancelled = true; };
  }, [contactId, refetchKey]);

  return rows;
}
