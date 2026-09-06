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

export type CallOutcome = 'answered' | 'no-answer' | 'voicemail' | 'wrong-number';

export async function logContactTouch(
  id: string,
  method: 'call' | 'text' | 'email',
  summary?: string,
  outcome?: CallOutcome | null,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from('contacts')
    .select('next_followup_date')
    .eq('id', id)
    .maybeSingle();

  const existingFollowup = existing?.next_followup_date ?? null;
  const hasFutureFollowup = existingFollowup != null && existingFollowup > today;

  let nextFollowUp: string | null;
  if (outcome === 'wrong-number') {
    nextFollowUp = null;
  } else if (outcome === 'no-answer' || outcome === 'voicemail') {
    const oneDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    nextFollowUp = hasFutureFollowup && existingFollowup! <= oneDay
      ? existingFollowup
      : oneDay;
  } else {
    nextFollowUp = hasFutureFollowup
      ? existingFollowup
      : new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  }

  const patch: Record<string, unknown> = {
    last_contact_date: today,
    last_contact_method: method,
    last_contact_summary: (summary ?? `${method} sent`).slice(0, 140),
    updated_at: new Date().toISOString(),
  };
  if (nextFollowUp !== existingFollowup) {
    patch.next_followup_date = nextFollowUp;
  }

  const { error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

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
  isPastCustomer?: boolean;
};

export async function createContact(draft: NewContactDraft): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const normalizedPhone = normalizePhone(draft.phone);
  const normalizedEmail = normalizeEmail(draft.email);

  // Keep capture idempotent while preserving opt-out history. Active duplicates
  // are blocked. Deleted non-DNC rows may be intentionally re-added, but a
  // deleted DNC row still blocks recreation so delete + re-add cannot bypass DNC.
  if (normalizedPhone || normalizedEmail) {
    const { data: existing, error: existingError } = await supabase
      .from('contacts')
      .select('id,phone,email,is_deleted,do_not_contact')
      .eq('user_id', user.id);
    if (existingError) throw existingError;

    const duplicate = (existing ?? []).find(row => {
      const samePhone = normalizedPhone && phoneKey(row.phone) === phoneKey(normalizedPhone);
      const sameEmail = normalizedEmail && normalizeEmail(row.email) === normalizedEmail;
      return !!samePhone || !!sameEmail;
    });
    if (duplicate?.is_deleted && duplicate?.do_not_contact) {
      throw new Error('This customer was previously marked do not contact. Review the existing record before contacting them again.');
    }
    if (duplicate && !duplicate.is_deleted) {
      throw new Error('That customer is already in your book. Open the existing contact instead of creating a duplicate.');
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: user.id,
      first_name: titleCase(draft.firstName),
      last_name: titleCase(draft.lastName) || null,
      phone: normalizedPhone || null,
      email: normalizedEmail || null,
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
      is_past_customer: !!draft.isPastCustomer,
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
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  currentMileage?: string;
  leaseEndDate?: string;
};

function normalizePhone(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return raw;
}

function phoneKey(value?: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function parseBoundedInt(value: string | undefined, min: number, max: number): number | null {
  const digits = (value ?? '').replace(/[,\s]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseDateOnly(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function bulkCreateContacts(rows: ImportContactRow[]): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const today = new Date().toISOString().slice(0, 10);
  const candidates = rows
    .map(r => ({
      first: titleCase((r.firstName ?? '').trim()),
      last: titleCase((r.lastName ?? '').trim()) || null,
      phone: normalizePhone(r.phone),
      email: normalizeEmail(r.email),
      notes: (r.notes ?? '').trim() || null,
      vehicleYear: parseBoundedInt(r.vehicleYear, 1900, 2100),
      vehicleMake: (r.vehicleMake ?? '').trim() ? normalizeVehicle(r.vehicleMake!) : null,
      vehicleModel: (r.vehicleModel ?? '').trim() ? normalizeVehicle(r.vehicleModel!) : null,
      currentMileage: parseBoundedInt(r.currentMileage, 0, 1_000_000),
      leaseEndDate: parseDateOnly(r.leaseEndDate),
    }))
    .filter(r => r.first.length > 0);

  if (candidates.length === 0) return 0;

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const unique = candidates.filter(r => {
    const pk = phoneKey(r.phone);
    const ek = r.email;
    const duplicate = (pk && seenPhones.has(pk)) || (ek && seenEmails.has(ek));
    if (pk) seenPhones.add(pk);
    if (ek) seenEmails.add(ek);
    return !duplicate;
  });

  const { data: existing, error: existingError } = await supabase
    .from('contacts')
    .select('phone,email,is_deleted,do_not_contact')
    .eq('user_id', user.id);
  if (existingError) throw existingError;

  // Active rows and any DNC row remain protected duplicates. Deleted non-DNC
  // rows may still be intentionally re-imported.
  const protectedExisting = (existing ?? []).filter(r => !r.is_deleted || r.do_not_contact);
  const existingPhones = new Set(protectedExisting.map(r => phoneKey(r.phone)).filter(Boolean));
  const existingEmails = new Set(protectedExisting.map(r => normalizeEmail(r.email)).filter(Boolean));

  const fresh = unique.filter(r => {
    const pk = phoneKey(r.phone);
    const ek = r.email;
    return !(pk && existingPhones.has(pk)) && !(ek && existingEmails.has(ek));
  });

  if (fresh.length === 0) return 0;

  const payload = fresh.map(r => ({
    user_id: user.id,
    first_name: r.first,
    last_name: r.last,
    phone: r.phone || null,
    email: r.email || null,
    notes: r.notes,
    vehicle_year: r.vehicleYear,
    vehicle_make: r.vehicleMake,
    vehicle_model: r.vehicleModel,
    current_mileage: r.currentMileage,
    lease_end_date: r.leaseEndDate,
    heat_score: 35,
    last_contact_date: today,
    tags: [] as string[],
    stage: 'active',
    milestones: [],
  }));

  const { error } = await supabase.from('contacts').insert(payload);
  if (error) throw error;
  return payload.length;
}

export async function deleteContact(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('contacts')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_deleted', false)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Contact was not deleted. Refresh and try again.');
}

export async function updateContactTier(id: string, tier: 'hot' | 'warm' | 'cold'): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({ tier_override: tier, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

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
