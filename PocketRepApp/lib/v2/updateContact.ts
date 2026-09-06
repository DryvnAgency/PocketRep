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

  // Read the current follow-up date so we don't clobber a Rex-set or rep-set
  // future date with a blind 3-day default.
  const { data: existing } = await supabase
    .from('contacts')
    .select('next_followup_date')
    .eq('id', id)
    .maybeSingle();

  const existingFollowup = existing?.next_followup_date ?? null;
  const hasFutureFollowup = existingFollowup != null && existingFollowup > today;

  // Outcome-aware follow-up scheduling:
  // - wrong-number  → clear any follow-up (don't chase a dead number)
  // - no-answer / voicemail → 1-day follow-up (unless a sooner date is already set)
  // - answered / text / email / default → 3-day default (unless a future date exists)
  let nextFollowUp: string | null;
  if (outcome === 'wrong-number') {
    nextFollowUp = null;
  } else if (outcome === 'no-answer' || outcome === 'voicemail') {
    const oneDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    // Don't push a follow-up LATER if one is already sooner
    nextFollowUp = hasFutureFollowup && existingFollowup! <= oneDay
      ? existingFollowup
      : oneDay;
  } else {
    // 3-day default — only apply when no future date exists
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
  // Only touch next_followup_date if we're actually changing it
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

  // Single-contact capture is used by both the manual Add Contact flow and Rex.
  // Keep it idempotent by phone/email just like bulk import. Active duplicates
  // are blocked. A soft-deleted row normally may be re-added, but a soft-deleted
  // DNC row must still block recreation so an opt-out can never be bypassed by
  // delete + re-add/import.
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
  // Keep international numbers intact; normalize common US 1XXXXXXXXXX to +1.
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

// Parse a loose numeric CSV cell (commas/spaces allowed) to an integer within
// [min,max], or null if missing/unparseable/out of range — used for the
// vehicle-year and current-mileage import columns so garbage text doesn't
// reach the DB as a bad int.
function parseBoundedInt(value: string | undefined, min: number, max: number): number | null {
  const digits = (value ?? '').replace(/[,\s]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// Parse a loose CSV date cell into YYYY-MM-DD, or null if missing/unparseable
// — used for the lease-end-date import column so an unrecognized format
// doesn't insert an invalid date.
function parseDateOnly(value: string | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Bulk import is intentionally idempotent by phone/email within the signed-in
// user's book. The review UI catches obvious duplicates first, but this second
// check protects against stale lists, repeated imports, and concurrent imports.
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

  // De-dupe the incoming batch itself before touching the database.
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

  // Pull only the fields needed for duplicate detection for this user's book.
  const { data: existing, error: existingError } = await supabase
    .from('contacts')
    .select('phone,email,is_deleted,do_not_contact')
    .eq('user_id', user.id);
  if (existingError) throw existingError;

  // Block active duplicates and preserve DNC even if that row was soft-deleted.
  // Ordinary deleted/non-DNC rows may still be intentionally re-imported.
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
  // "Delete" removes the contact from the active book without erasing the
  // activity/deal history that hangs off the row. Request the changed row back:
  // PostgREST otherwise reports a policy-filtered zero-row update as a successful
  // request, which would let the UI claim a contact disappeared when it did not.
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
