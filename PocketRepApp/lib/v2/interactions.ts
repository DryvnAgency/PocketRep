import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// A single entry in a contact's activity timeline. Backed by public.interactions
// (RLS: user_id = auth.uid()), written whenever the rep calls/texts/emails or
// saves a note from the contact detail screen.
export type InteractionType = 'call' | 'text' | 'email' | 'note';

export type Interaction = {
  id: string;
  type: InteractionType;
  notes: string | null;
  outcome: string | null;
  interactionDate: string; // ISO timestamp
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

// Reads a contact's recent interactions, newest first. `refetchKey` bumps to
// re-pull after a new interaction is logged (same shape as useContactNurtures).
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
      .from('interactions')
      .select('id,type,notes,outcome,interaction_date')
      .eq('contact_id', contactId)
      .order('interaction_date', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Surface read failures (RLS / network) instead of silently rendering
          // an empty timeline. Keep any previously-loaded rows rather than
          // blanking on a failed refetch.
          console.error('useInteractions: failed to load interactions', error);
          return;
        }
        setRows(
          ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            type: r.type,
            notes: r.notes,
            outcome: r.outcome,
            interactionDate: r.interaction_date,
          })),
        );
      });
    return () => { cancelled = true; };
  }, [contactId, refetchKey]);

  return rows;
}
