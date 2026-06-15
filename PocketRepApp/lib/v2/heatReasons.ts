// Heat Sheet reason codes (P1-R1): a short, human "why is this contact hot / at
// risk today" derived STRICTLY from saved contact fields — no inference, no
// fabrication. Every string here maps to a concrete field value; if the data
// isn't there, no reason is emitted. Returned most-actionable-first; the Heat
// Sheet shows the top couple.

import type { V2Contact } from './useContacts';

// Whole-day diff from today (local) to a YYYY-MM-DD date. Positive = future.
function daysUntilDate(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.round((target - today) / 86_400_000);
}

// Days until the next occurrence of a birthday (month/day only), 0 = today.
function daysUntilBirthday(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const mo = +m[2] - 1;
  const day = +m[3];
  if (mo < 0 || mo > 11 || day < 1 || day > 31) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let next = Date.UTC(now.getFullYear(), mo, day);
  if (next < today) next = Date.UTC(now.getFullYear() + 1, mo, day);
  return Math.round((next - today) / 86_400_000);
}

const DECISION_REASON: Record<string, string> = {
  push: 'you marked push',
  fence: 'on the fence',
  watch: 'watch list',
};

export function heatReasons(c: V2Contact): string[] {
  const out: string[] = [];

  // Timeline the rep set on the contact (TODAY is the most urgent).
  if (c.planLabel === 'TODAY') out.push('closing today');

  // Lease end — a top buying signal (equity + renewal). lease_end_date field.
  const lease = daysUntilDate(c.leaseEndDate);
  if (lease != null) {
    if (lease < 0) out.push('lease expired');
    else if (lease === 0) out.push('lease ends today');
    else if (lease <= 120) out.push(`lease ends in ${lease}d`);
  }

  // Birthday within two weeks — a warm, no-pressure touch.
  const bday = daysUntilBirthday(c.birthday);
  if (bday != null && bday <= 14) out.push(bday === 0 ? 'birthday today' : `birthday in ${bday}d`);

  if (c.planLabel === 'THIS WEEK') out.push('buying this week');

  // Silence (days since last_contact_date). days > 0 implies a real prior contact;
  // days === 0 is ambiguous (today OR never contacted), so we don't claim either.
  if (c.days >= 14) out.push(`silent ${c.days}d`);
  else if (c.days >= 4) out.push(`${c.days}d no contact`);

  // The rep's own decision flag.
  if (c.repDecision && DECISION_REASON[c.repDecision]) out.push(DECISION_REASON[c.repDecision]);

  if (c.planLabel === 'THIS MONTH') out.push('buying this month');

  if (c.isPastCustomer) out.push('past customer');
  if (c.tradeIn && c.tradeIn.trim()) out.push('has a trade-in');
  if (c.referredByName && c.referredByName.trim()) out.push(`referred by ${c.referredByName.trim()}`);

  return out;
}
