import { supabase } from '@/lib/supabase';

// Capitalize the first letter of each word without lowercasing the rest, so
// "lalo ponce" -> "Lalo Ponce" while preserving intentional caps (e.g. McLaren).
function titleCase(s: string): string {
  return s.trim().replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

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

// Records a call/text/email touch: stamps last_contact_date=today, the method
// and a short summary, and pushes the follow-up clock out a few days. This is
// what makes "working a lead IS logging it" — no double entry.
export async function logContactTouch(
  id: string,
  method: 'call' | 'text' | 'email',
  summary?: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const nextFollowUp = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await supabase
    .from('contacts')
    .update({
      last_contact_date: today,
      last_contact_method: method,
      last_contact_summary: (summary ?? `${method} sent`).slice(0, 140),
      next_followup_date: nextFollowUp,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// `value` is a YYYY-MM-DD date string, or null to clear it.
export async function updateContactBirthday(id: string, value: string | null): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ birthday: value, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export type NewContactDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  vehicle: string;
  trim: string;
  budget: string;
  tradeIn: string;
  planLabel: 'TODAY' | 'THIS WEEK' | 'THIS MONTH' | 'NEXT QTR' | '';
  heatScore: number;
  notes: string;
  tags: string[];
  birthday?: string | null;
};

export async function createContact(draft: NewContactDraft): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      first_name: titleCase(draft.firstName),
      last_name: titleCase(draft.lastName) || null,
      phone: draft.phone.trim() || null,
      email: draft.email?.trim() || null,
      vehicle: draft.vehicle.trim() || null,
      trim: draft.trim.trim() || null,
      budget: draft.budget.trim() || null,
      trade_in: draft.tradeIn.trim() || null,
      plan_label: draft.planLabel || null,
      heat_score: draft.heatScore,
      last_contact_date: today,
      notes: draft.notes.trim() || null,
      birthday: draft.birthday || null,
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
