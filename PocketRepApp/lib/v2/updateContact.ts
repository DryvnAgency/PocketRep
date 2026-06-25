import { supabase } from '@/lib/supabase';
import { titleCase, normalizeVehicle } from './format';

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
  referredByContactId?: string | null;
  referredByName?: string | null;
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
      vehicle: normalizeVehicle(draft.vehicle) || null,
      trim: normalizeVehicle(draft.trim) || null,
      budget: draft.budget.trim() || null,
      trade_in: draft.tradeIn.trim() || null,
      plan_label: draft.planLabel || null,
      heat_score: draft.heatScore,
      last_contact_date: today,
      notes: draft.notes.trim() || null,
      birthday: draft.birthday || null,
      referred_by_contact_id: draft.referredByContactId ?? null,
      referred_by_name: draft.referredByName ?? null,
      tags: draft.tags,
      stage: 'active',
      milestones: [],
    })
    .select('id')
    .single();
  if (error) throw error;
  return data!.id as string;
}

export type ImportContactRow = {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

// Bulk-insert imported contacts in a single round-trip. Fresh imports seed as cold
// leads (heat_score 35) with today's last-contact date — honest defaults, not faked
// interest. Rows whose first name is blank are skipped. Returns the count inserted.
export async function bulkCreateContacts(rows: ImportContactRow[]): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const today = new Date().toISOString().slice(0, 10);
  const payload = rows
    .map(r => ({ first: titleCase((r.firstName ?? '').trim()), r }))
    .filter(x => x.first.length > 0)
    .map(({ first, r }) => ({
      user_id: user.id,
      first_name: first,
      last_name: titleCase((r.lastName ?? '').trim()) || null,
      phone: (r.phone ?? '').trim() || null,
      email: (r.email ?? '').trim() || null,
      notes: (r.notes ?? '').trim() || null,
      heat_score: 35,
      last_contact_date: today,
      tags: [] as string[],
      stage: 'active',
      milestones: [],
    }));
  if (payload.length === 0) return 0;
  const { error } = await supabase.from('contacts').insert(payload);
  if (error) throw error;
  return payload.length;
}

// Hard delete: actually removes the row from the database. Child rows clean up
// via FK (interactions / nurture_messages / milestones / contact_sequences
// cascade; deals + rex_messages keep their history with contact_id set null).
export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Rep-set heat tier — overrides the heat_score-derived tier in the v2 UI.
export async function updateContactTier(id: string, tier: 'hot' | 'warm' | 'cold'): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ tier_override: tier, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Who referred this contact. Links to a saved contact (contactId) when the
// referrer is in the book, and/or stores a free-text name. Pass nulls to clear.
export async function updateContactReferredBy(
  id: string,
  referredBy: { contactId: string | null; name: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({
      referred_by_contact_id: referredBy.contactId,
      referred_by_name: referredBy.name,
      updated_at: new Date().toISOString(),
    })
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

// Edit the contact's display name. Splits a full-name string into first/last and
// stores them the same way createContact does (title-cased; empty last → null).
export async function updateContactName(
  id: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  const first = titleCase(firstName.trim());
  if (!first) throw new Error('Name is required');
  const { error } = await supabase
    .from('contacts')
    .update({
      first_name: first,
      last_name: titleCase(lastName.trim()) || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// Edit the vehicle-interest card fields. Every key is optional so a single field
// can be saved on its own; an empty string clears that column to null. vehicle/trim
// run through normalizeVehicle to match how createContact stores them.
export async function updateContactVehicleInfo(
  id: string,
  patch: { vehicle?: string; trim?: string; budget?: string; tradeIn?: string },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.vehicle !== undefined) row.vehicle = normalizeVehicle(patch.vehicle) || null;
  if (patch.trim !== undefined) row.trim = normalizeVehicle(patch.trim) || null;
  if (patch.budget !== undefined) row.budget = patch.budget.trim() || null;
  if (patch.tradeIn !== undefined) row.trade_in = patch.tradeIn.trim() || null;
  const { error } = await supabase.from('contacts').update(row).eq('id', id);
  if (error) throw error;
}
