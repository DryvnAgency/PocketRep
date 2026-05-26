import { supabase } from '@/lib/supabase';

export async function updateContactNotes(id: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateContactTags(id: string, tags: string[]): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ tags, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export type NewContactDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  vehicle: string;
  trim: string;
  budget: string;
  tradeIn: string;
  planLabel: 'TODAY' | 'THIS WEEK' | 'THIS MONTH' | 'NEXT QTR' | '';
  heatScore: number;
  notes: string;
  tags: string[];
};

export async function createContact(draft: NewContactDraft): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      first_name: draft.firstName.trim(),
      last_name: draft.lastName.trim() || null,
      phone: draft.phone.trim() || null,
      vehicle: draft.vehicle.trim() || null,
      trim: draft.trim.trim() || null,
      budget: draft.budget.trim() || null,
      trade_in: draft.tradeIn.trim() || null,
      plan_label: draft.planLabel || null,
      heat_score: draft.heatScore,
      last_contact_date: today,
      notes: draft.notes.trim() || null,
      tags: draft.tags,
      stage: 'active',
      milestones: [],
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function updateContactPreferredLanguage(
  id: string,
  language: 'en' | 'es',
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ preferred_language: language, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
