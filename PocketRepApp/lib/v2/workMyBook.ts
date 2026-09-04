// Work My Book — real opportunity sources for the Daily Execution Engine.
//
// This is a data/business-logic layer only (no UI — see note below on why).
// It computes two opportunity types, both sourced from real, saved state:
//
//   1. Due sequence touches — reuses the existing sequence/enrollment
//      engine (generateQueue in lib/messageQueue.ts) so a "due" item here
//      is the exact same real, review-first queue already shown in
//      Sequence Follow-ups (FollowUpQueue.tsx). generateQueue does not
//      select do_not_contact on its way out (the authoritative send-time
//      gate lives in smsLauncher.ts's launchSms, which already fails
//      closed on DNC/deleted), so this module re-verifies do_not_contact/
//      is_deleted defensively before calling anything a live opportunity —
//      belt-and-suspenders against showing a rep dead-end "due" work for a
//      suppressed contact. messageQueue.ts itself is intentionally NOT
//      modified here: another in-flight branch (PR #161) already carries
//      substantial independent changes to that exact file tonight, and
//      editing it too would create an avoidable merge collision. The gap
//      is real but small (display-only — sends already fail closed), so
//      it is closed at this call site instead of upstream.
//
//   2. Referral opportunities — surfaced ONLY when a real, saved signal
//      makes the ask legitimate: a deal on file whose closed_at lands on an
//      ownership anniversary window, or a previously recorded positive
//      reply (nurture_messages.reply_sentiment = 'positive'). Nothing here
//      infers satisfaction from silence, a heat score, or elapsed time
//      alone — every opportunity cites the concrete saved fact it came
//      from, and the ask itself is worded conditionally (never presuming a
//      happy outcome that wasn't recorded).
//
//      Active/completed enrollment in a post-sale journey (Sold Customer
//      Ownership, New Vehicle Delivery, Second Delivery, Lease Maturity) is
//      NOT by itself a qualifying signal — per PR #164 review, early-stage
//      membership (e.g. day 1 of New Vehicle Delivery) can predate any
//      actual expressed satisfaction. It's used only as enrichment/context
//      on the reason string once eligibility is already established by an
//      anniversary or a recorded positive reply.
//
// Compliance, both sources: excludes is_deleted, do_not_contact, and
// rep_decision 'dead'/'kill' contacts. Nothing here sends anything — these
// are read-only computations for a rep to review and act on one at a time,
// exactly like the existing Sequence Follow-ups queue. A contact who
// already has a due sequence touch today is excluded from the referral
// list so the same relationship isn't surfaced twice in one pass (e.g. the
// New Vehicle Delivery template's own final step already IS a referral ask
// — see supabase/migrations/20260904000000_v2_canonical_sequence_templates.sql).
//
// Not wired into a screen: the unified "Work My Book" hub UI
// (WorkMyBookSheet.tsx) is being built on a separate, unmerged branch
// (PR #161) tonight. Wiring this module into a new or existing screen here
// would either duplicate that work or collide with it. This module is the
// integration-ready data layer either that PR or a future one can call.

import { supabase } from '@/lib/supabase';
import { generateQueue, type QueueItem } from '@/lib/messageQueue';

export type WorkMyBookOpportunitySource = 'due_sequence' | 'referral';

export type WorkMyBookOpportunity = {
  source: WorkMyBookOpportunitySource;
  contact_id: string;
  contact_name: string;
  phone: string;
  email: string;
  vehicle: string | null;
  channel: 'text' | 'call' | 'email';
  reason: string;
  message: string | null;
  unresolved_tokens?: string[];
  due_date: string;
  isDemo: boolean;
};

// Context/wording enrichment ONLY, never eligibility on their own (see file
// header) — membership here does not by itself make a referral ask
// legitimate.
const OWNERSHIP_CONTEXT_SEQUENCE_NAMES = [
  'Sold Customer Ownership',
  'New Vehicle Delivery',
  'Second Delivery',
  'Lease Maturity',
];

// rep_decision values this codebase already treats as "written off"
// (batchKill in lib/v2/stalledLeads.ts sets 'dead'; 'kill' is an accepted
// legacy/alternate value elsewhere — see lib/v2/nurtureEngine.ts).
const DEAD_DECISIONS = new Set(['dead', 'kill']);

// How recent a recorded positive reply still counts as a live,
// referral-legitimate signal. Past this window it is stale enough that it
// should not, by itself, be treated as "still a good moment to ask."
const POSITIVE_REPLY_WINDOW_DAYS = 120;

// A closed deal counts as an ownership anniversary when today falls within
// this many days of the same month/day, at least one full year later.
const ANNIVERSARY_WINDOW_DAYS = 3;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

// Pure: baseline suppression every opportunity source must apply.
export function isSuppressed(c: {
  is_deleted?: boolean | null;
  do_not_contact?: boolean | null;
  rep_decision?: string | null;
}): boolean {
  return !!c.is_deleted || !!c.do_not_contact || DEAD_DECISIONS.has(String(c.rep_decision ?? ''));
}

// Pure: does closed_at land on an ownership anniversary as of `today`?
// At least one full year must have elapsed — a deal closed 3 weeks ago is
// not "an anniversary" just because a birthday-style month/day happens to
// be nearby.
export function computeAnniversarySignal(
  closedAtIso: string | null | undefined,
  today: Date = new Date(),
): { years: number } | null {
  if (!closedAtIso) return null;
  const closed = new Date(closedAtIso.length === 10 ? `${closedAtIso}T00:00:00Z` : closedAtIso);
  if (Number.isNaN(closed.getTime())) return null;
  const years = today.getUTCFullYear() - closed.getUTCFullYear();
  if (years < 1) return null;
  const occurrence = new Date(Date.UTC(today.getUTCFullYear(), closed.getUTCMonth(), closed.getUTCDate()));
  if (Number.isNaN(occurrence.getTime())) return null;
  if (Math.abs(daysBetween(today, occurrence)) > ANNIVERSARY_WINDOW_DAYS) return null;
  return { years };
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

// The only two signals that can, by themselves, make a referral ask
// legitimate (see file header — sequence membership is enrichment, not a
// third member of this union).
type ReferralSignal =
  | { kind: 'anniversary'; years: number }
  | { kind: 'positive_reply'; daysAgo: number };

// Strongest/most concrete signal wins when a contact qualifies more than
// one way, so the ask cites the single clearest real reason.
const SIGNAL_PRIORITY: Record<ReferralSignal['kind'], number> = {
  anniversary: 0,
  positive_reply: 1,
};

export function strongestReferralSignal(signals: ReferralSignal[]): ReferralSignal | null {
  if (signals.length === 0) return null;
  return signals.slice().sort((a, b) => SIGNAL_PRIORITY[a.kind] - SIGNAL_PRIORITY[b.kind])[0];
}

// `activeSequenceName`, when present, is appended as context — it never
// changes WHETHER this fires, only how the reason reads once a real
// qualifying signal already fired it.
export function referralReason(signal: ReferralSignal, activeSequenceName?: string | null): string {
  const base = (() => {
    switch (signal.kind) {
      case 'anniversary':
        return `${signal.years}-year ownership anniversary this week`;
      case 'positive_reply':
        return `Replied positively ${signal.daysAgo}d ago`;
    }
  })();
  return activeSequenceName ? `${base} — currently on the ${activeSequenceName} follow-up` : base;
}

function referralSignalText(signal: ReferralSignal): string {
  switch (signal.kind) {
    case 'anniversary':
      return `it's been ${signal.years} year${signal.years === 1 ? '' : 's'} since we got you into it`;
    case 'positive_reply':
      return 'glad that landed well';
  }
}

// Pure: the referral ask itself. Worded conditionally on the concrete real
// fact behind it — never presuming a satisfaction level that wasn't
// recorded, never mentioning pricing/inventory/promotions.
export function buildReferralOpener(contactName: string, vehicle: string | null, signal: ReferralSignal): string {
  const first = firstName(contactName);
  const veh = vehicle ? ` ${vehicle}` : ' vehicle';
  return `hey ${first}, ${referralSignalText(signal)} — hope the${veh} is still treating you well. `
    + `if you know anyone else in the market, I'd really appreciate the referral.`;
}

/**
 * Due sequence touches — the exact real, review-first queue the sequence/
 * enrollment engine already computes (generateQueue), reshaped into the
 * Work My Book opportunity shape and defensively re-checked against
 * do_not_contact/is_deleted immediately before surfacing (see file header).
 */
export async function getDueSequenceOpportunities(userId: string, plan: string): Promise<WorkMyBookOpportunity[]> {
  const queue: QueueItem[] = await generateQueue(userId, plan);
  if (queue.length === 0) return [];

  const contactIds = [...new Set(queue.map(q => q.contact_id))];
  const { data: safety, error } = await supabase
    .from('contacts')
    .select('id,is_deleted,do_not_contact')
    .in('id', contactIds);
  if (error) throw error;
  const suppressed = new Set(
    (safety ?? [])
      .filter((r: any) => isSuppressed(r))
      .map((r: any) => r.id as string),
  );

  return queue
    .filter(item => !suppressed.has(item.contact_id))
    .map(item => ({
      source: 'due_sequence' as const,
      contact_id: item.contact_id,
      contact_name: item.contact_name,
      phone: item.phone,
      email: item.email,
      vehicle: null,
      channel: item.channel,
      reason: `Sequence step ${item.step_number} due ${item.due_date}`,
      message: item.message || null,
      unresolved_tokens: item.unresolved_tokens,
      due_date: item.due_date,
      isDemo: !!item.isDemo,
    }));
}

/**
 * Referral opportunities — only for contacts with a real, saved positive
 * relationship signal. See file header for the exact rules. `excludeContactIds`
 * lets the caller (getWorkMyBookOpportunities) keep a contact from appearing
 * here on the same pass they already have a due sequence touch.
 */
export async function getReferralOpportunities(
  userId: string,
  excludeContactIds: Iterable<string> = [],
): Promise<WorkMyBookOpportunity[]> {
  const exclude = new Set(excludeContactIds);
  const today = new Date();

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id,first_name,last_name,phone,email,vehicle,is_deleted,do_not_contact,rep_decision,is_past_customer,is_demo')
    .eq('user_id', userId)
    .eq('is_past_customer', true)
    .eq('is_deleted', false)
    .eq('do_not_contact', false);
  if (error) throw error;

  const candidates = (contacts ?? []).filter((c: any) => !isSuppressed(c) && !exclude.has(c.id));
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((c: any) => c.id as string);

  const [{ data: enrollments }, { data: deals }, { data: replies }] = await Promise.all([
    supabase
      .from('contact_sequences')
      .select('contact_id,status,sequences!inner(name)')
      .in('contact_id', candidateIds)
      .in('status', ['active', 'completed']),
    supabase
      .from('deals')
      .select('contact_id,closed_at')
      .in('contact_id', candidateIds)
      .not('closed_at', 'is', null),
    supabase
      .from('nurture_messages')
      .select('contact_id,sent_at,created_at')
      .in('contact_id', candidateIds)
      .eq('reply_sentiment', 'positive'),
  ]);

  // Eligibility signals — anniversary and positive reply ONLY. Sequence
  // membership is deliberately excluded from this map; it can never grant
  // eligibility on its own (see file header + OWNERSHIP_CONTEXT_SEQUENCE_NAMES).
  const signalsByContact = new Map<string, ReferralSignal[]>();
  const addSignal = (contactId: string, signal: ReferralSignal) => {
    const list = signalsByContact.get(contactId) ?? [];
    list.push(signal);
    signalsByContact.set(contactId, list);
  };
  for (const d of (deals ?? []) as any[]) {
    const anniv = computeAnniversarySignal(d.closed_at, today);
    if (anniv) addSignal(d.contact_id, { kind: 'anniversary', years: anniv.years });
  }
  for (const r of (replies ?? []) as any[]) {
    const when = r.sent_at ?? r.created_at;
    const daysAgo = when ? Math.max(0, daysBetween(today, new Date(when))) : null;
    if (daysAgo !== null && daysAgo <= POSITIVE_REPLY_WINDOW_DAYS) {
      addSignal(r.contact_id, { kind: 'positive_reply', daysAgo });
    }
  }

  // Context/wording enrichment only — computed separately so it can never
  // add an entry to signalsByContact above, only decorate the reason for a
  // contact who already qualified through a real signal.
  const sequenceNameByContact = new Map<string, string>();
  for (const e of (enrollments ?? []) as any[]) {
    const name = e.sequences?.name;
    if (name && OWNERSHIP_CONTEXT_SEQUENCE_NAMES.includes(name) && !sequenceNameByContact.has(e.contact_id)) {
      sequenceNameByContact.set(e.contact_id, name);
    }
  }

  const contactById = new Map(candidates.map((c: any) => [c.id as string, c]));
  const opportunities: WorkMyBookOpportunity[] = [];
  for (const [contactId, signals] of signalsByContact) {
    const c = contactById.get(contactId);
    const signal = strongestReferralSignal(signals);
    if (!c || !signal) continue;
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    opportunities.push({
      source: 'referral',
      contact_id: contactId,
      contact_name: name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      vehicle: c.vehicle ?? null,
      channel: 'text',
      reason: referralReason(signal, sequenceNameByContact.get(contactId) ?? null),
      message: buildReferralOpener(name, c.vehicle ?? null, signal),
      due_date: today.toISOString().slice(0, 10),
      isDemo: !!c.is_demo,
    });
  }

  opportunities.sort((a, b) => a.contact_name.localeCompare(b.contact_name));
  return opportunities;
}

/**
 * Combined Work My Book opportunity list: real due sequence touches first,
 * then referral opportunities for contacts not already represented above.
 */
export async function getWorkMyBookOpportunities(userId: string, plan: string): Promise<WorkMyBookOpportunity[]> {
  const dueSequence = await getDueSequenceOpportunities(userId, plan);
  const referral = await getReferralOpportunities(userId, dueSequence.map(o => o.contact_id));
  return [...dueSequence, ...referral];
}
