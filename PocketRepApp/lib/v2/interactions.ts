import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// A single entry in a contact's activity timeline. Write-side entries go to
// public.interactions; the read-side useInteractions now queries the
// public.contact_timeline VIEW that unions interactions, contact_interactions,
// and nurture_messages into one chronological stream.
export type InteractionType = 'call' | 'text' | 'email' | 'note';

// Timeline event types include the original InteractionTypes plus events
// surfaced from other tables via the contact_timeline VIEW.
export type TimelineEventType =
  | InteractionType
  | 'nurture'
  | 'reply'
  | 'referral_ask'
  | string; // other nurture_messages.kind values

export type Interaction = {
  id: string;
  type: TimelineEventType;
  notes: string | null;
  outcome: string | null;
  interactionDate: string; // ISO timestamp
  source: 'interaction' | 'sequence_step' | 'nurture' | 'reply';
};

// Append an interaction. RLS requires user_id = auth.uid(), so stamp it
// explicitly (same pattern as deals/nurture/tags inserts).
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

// Reads a contact's unified activity timeline (interactions + sequence steps +
// nurture messages + replies), newest first. Backed by the contact_timeline
// VIEW so all event sources appear in one chronological stream.
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
          // Surface read failures (RLS / network) instead of silently rendering
          // an empty timeline. Keep any previously-loaded rows rather than
          // blanking on a failed refetch.
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
