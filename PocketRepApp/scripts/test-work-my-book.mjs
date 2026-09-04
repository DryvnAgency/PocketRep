// Regression coverage for the Work My Book expansion (lib/v2/workMyBook.ts):
// two new opportunity sources — real due sequence touches (reusing the
// actual sequence/enrollment engine) and referral opportunities gated on a
// real, saved positive relationship signal.
//
// Source-grep guardrails on the real module, plus a JS mirror of the pure
// decision functions run against synthetic fixtures — this repo has no
// live Supabase in tests, so the mirror proves the *algorithm* (suppression,
// anniversary math, signal priority, cross-source dedup) is correct, while
// the source-grep proves the real file actually reuses the real engine and
// never fabricates/auto-sends.
//
//   node scripts/test-work-my-book.mjs    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'lib/v2/workMyBook.ts'), 'utf8');

// --- 1. source guardrails ----------------------------------------------------
console.log('\n--- due sequence touches reuse the real sequence/enrollment engine ---');
ok('imports generateQueue from the real message queue instead of reinventing it',
  /import \{ generateQueue, type QueueItem \} from '@\/lib\/messageQueue';/.test(src));
ok('does not touch/patch messageQueue.ts from this module (no local redefinition)',
  !/function generateQueue/.test(src));
ok('getDueSequenceOpportunities defensively re-checks do_not_contact/is_deleted before surfacing',
  /getDueSequenceOpportunities[\s\S]*?is_deleted,do_not_contact/.test(src));

console.log('\n--- compliance: suppression applies to both sources ---');
ok('isSuppressed checks is_deleted', /is_deleted/.test(src) && /function isSuppressed/.test(src));
ok('isSuppressed checks do_not_contact', /!!c\.do_not_contact/.test(src));
ok("isSuppressed treats both 'dead' and 'kill' rep_decision as written off",
  /DEAD_DECISIONS = new Set\(\['dead', 'kill'\]\)/.test(src));
ok('getReferralOpportunities queries only is_past_customer=true, is_deleted=false, do_not_contact=false candidates',
  /\.eq\('is_past_customer', true\)/.test(src) &&
  /\.eq\('is_deleted', false\)/.test(src) &&
  /\.eq\('do_not_contact', false\)/.test(src));
ok('getReferralOpportunities is scoped to the calling rep (eq user_id)',
  /\.eq\('user_id', userId\)/.test(src));

console.log('\n--- referral opportunities are gated on real, saved positive signals only ---');
ok('ownership-context sequence allowlist is exactly the 4 post-sale ownership templates',
  /OWNERSHIP_CONTEXT_SEQUENCE_NAMES = \[\s*'Sold Customer Ownership',\s*'New Vehicle Delivery',\s*'Second Delivery',\s*'Lease Maturity',?\s*\];/.test(src));
ok('prospecting-only templates are never treated as ownership context either',
  !/'Fresh Up - 14 Day'/.test(src) && !/'Unsold Long-Term/.test(src) && !/'Holiday Check-In'/.test(src));
ok('anniversary signal requires a real deals.closed_at value (no fabricated date)',
  /computeAnniversarySignal\(d\.closed_at, today\)/.test(src));
ok('positive reply signal requires an actually recorded reply_sentiment = positive row',
  /\.eq\('reply_sentiment', 'positive'\)/.test(src));
ok('no sentiment/sale-happiness is guessed from silence, heat score, or elapsed time alone',
  !/heat_score/.test(src) && !/days_silent/.test(src));

console.log('\n--- PR #164 review: sequence membership alone can never grant referral eligibility ---');
ok("ReferralSignal only has 2 kinds — anniversary and positive_reply — sequence is not one of them",
  /type ReferralSignal =\s*\n\s*\| \{ kind: 'anniversary'; years: number \}\s*\n\s*\| \{ kind: 'positive_reply'; daysAgo: number \};/.test(src));
const signalsLoopMatch = src.match(/const signalsByContact = new Map[\s\S]*?const sequenceNameByContact/);
const signalsLoop = signalsLoopMatch ? signalsLoopMatch[0] : '';
ok('signalsByContact (the eligibility gate) is built only from deals/replies, never from enrollments',
  !!signalsLoopMatch && !/enrollments/.test(signalsLoop));
ok('sequence enrollment is read into a separate map that never feeds signalsByContact',
  /const sequenceNameByContact = new Map<string, string>\(\);/.test(src) &&
  /for \(const e of \(enrollments \?\? \[\]\) as any\[\]\) \{[\s\S]*?sequenceNameByContact\.set/.test(src));
ok('the enrichment map is only ever read when building the reason string (never gates opportunity creation)',
  /referralReason\(signal, sequenceNameByContact\.get\(contactId\) \?\? null\)/.test(src));

console.log('\n--- referral wording stays conditional and truthful ---');
ok('the ask is conditional ("if you know anyone else"), never presumed',
  /if you know anyone else in the market, I'’|'d really appreciate the referral|if you know anyone else in the market, I'\\'d really appreciate the referral/.test(src) ||
  /if you know anyone else in the market/.test(src));
ok('no pricing/promo/discount/urgency language anywhere in the module',
  !/\b(discount|% off|sale price|limited time|promo|deal ends|hurry|act now|last chance)\b/i.test(src));
const openerFnMatch = src.match(/export function buildReferralOpener\([\s\S]*?\n\}/);
const openerFn = openerFnMatch ? openerFnMatch[0] : '';
ok('buildReferralOpener is present and isolable', !!openerFnMatch);
ok('the actual generated referral message never mentions inventory/appointments',
  !/\bappointment\b/i.test(openerFn) && !/\binventory\b/i.test(openerFn));

console.log('\n--- nothing here sends anything; read-only, one-at-a-time by construction ---');
ok('no direct send/launch calls (Linking, fetch, smsLauncher) from this module — only doc-comment mentions of the real send-time gate',
  !/Linking\.openURL/.test(src) && !/launchSms\(/.test(src) && !/\bfetch\(/.test(src));

console.log('\n--- Work My Book aggregator dedups across sources ---');
ok('getWorkMyBookOpportunities excludes due-sequence contacts from the referral pass',
  /getReferralOpportunities\(userId, dueSequence\.map\(o => o\.contact_id\)\)/.test(src));
ok('due sequence touches are listed first, referral opportunities after',
  src.indexOf('const dueSequence = await getDueSequenceOpportunities') <
  src.indexOf('const referral = await getReferralOpportunities'));

// --- 2. mirror of the pure decision functions --------------------------------
console.log('\n--- MIRROR: isSuppressed ---');
const DEAD_DECISIONS = new Set(['dead', 'kill']);
function isSuppressed(c) {
  return !!c.is_deleted || !!c.do_not_contact || DEAD_DECISIONS.has(String(c.rep_decision ?? ''));
}
ok('deleted contact is suppressed', isSuppressed({ is_deleted: true }) === true);
ok('do_not_contact contact is suppressed', isSuppressed({ do_not_contact: true }) === true);
ok("rep_decision 'dead' is suppressed", isSuppressed({ rep_decision: 'dead' }) === true);
ok("rep_decision 'kill' is suppressed", isSuppressed({ rep_decision: 'kill' }) === true);
ok('a normal active contact is not suppressed', isSuppressed({ rep_decision: 'active' }) === false);
ok('a contact with no flags set at all is not suppressed', isSuppressed({}) === false);

console.log('\n--- MIRROR: computeAnniversarySignal ---');
const ANNIVERSARY_WINDOW_DAYS = 3;
function daysBetween(a, b) { return Math.round((a.getTime() - b.getTime()) / 86_400_000); }
function computeAnniversarySignal(closedAtIso, today = new Date()) {
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
const TODAY = new Date(Date.UTC(2026, 8, 4)); // 2026-09-04, matches this session's date
ok('exactly one year ago today is a 1-year anniversary',
  computeAnniversarySignal('2025-09-04', TODAY)?.years === 1);
ok('one year ago plus 10 days is outside the window (null)',
  computeAnniversarySignal('2025-09-14', TODAY) === null);
ok('6 months ago is not an anniversary yet (less than 1 full year)',
  computeAnniversarySignal('2026-03-04', TODAY) === null);
ok('exactly two years ago today is a 2-year anniversary',
  computeAnniversarySignal('2024-09-04', TODAY)?.years === 2);
ok('null closed_at yields no signal', computeAnniversarySignal(null, TODAY) === null);
ok('a date 2 days before today, one year later, is inside the window',
  computeAnniversarySignal('2025-09-02', TODAY)?.years === 1);

console.log('\n--- MIRROR: strongest signal priority (anniversary > positive_reply; sequence never competes) ---');
const SIGNAL_PRIORITY = { anniversary: 0, positive_reply: 1 };
function strongestReferralSignal(signals) {
  if (signals.length === 0) return null;
  return signals.slice().sort((a, b) => SIGNAL_PRIORITY[a.kind] - SIGNAL_PRIORITY[b.kind])[0];
}
ok('anniversary wins over a positive_reply signal when both are present',
  strongestReferralSignal([{ kind: 'positive_reply' }, { kind: 'anniversary', years: 1 }]).kind === 'anniversary');
ok('no signals yields null (no opportunity — this is the "do not manufacture satisfaction" rule)',
  strongestReferralSignal([]) === null);

console.log('\n--- MIRROR: PR #164 review — sequence membership alone never qualifies, only enriches ---');
// Mirrors getReferralOpportunities' real separation: eligibilitySignals only
// ever come from deals/replies; sequence membership lands in a side map that
// can only decorate the reason for a contact who already has a real signal.
function computeReferralOpportunities(contacts, dealAnniversaries, positiveReplies, sequenceMemberships) {
  const signalsByContact = new Map();
  const add = (id, s) => signalsByContact.set(id, [...(signalsByContact.get(id) ?? []), s]);
  for (const [id, years] of Object.entries(dealAnniversaries)) add(id, { kind: 'anniversary', years });
  for (const [id, daysAgo] of Object.entries(positiveReplies)) add(id, { kind: 'positive_reply', daysAgo });
  const sequenceNameByContact = new Map(Object.entries(sequenceMemberships));
  const out = [];
  for (const [id, signals] of signalsByContact) {
    const signal = strongestReferralSignal(signals);
    if (!signal) continue;
    out.push({ contact_id: id, sequenceContext: sequenceNameByContact.get(id) ?? null });
  }
  return out;
}
const sequenceOnly = computeReferralOpportunities(
  ['solo-sequence-contact'], {}, {}, { 'solo-sequence-contact': 'New Vehicle Delivery' },
);
ok('a contact enrolled in New Vehicle Delivery with NO anniversary/positive-reply signal gets zero referral opportunities',
  sequenceOnly.length === 0);
const anniversaryPlusSequence = computeReferralOpportunities(
  ['ready-contact'], { 'ready-contact': 1 }, {}, { 'ready-contact': 'Lease Maturity' },
);
ok('a contact with a real anniversary AND sequence membership still gets exactly one opportunity',
  anniversaryPlusSequence.length === 1);
ok('sequence membership is carried through as context once eligibility is already established',
  anniversaryPlusSequence[0].sequenceContext === 'Lease Maturity');
const anniversaryNoSequence = computeReferralOpportunities(['plain-contact'], { 'plain-contact': 2 }, {}, {});
ok('a contact with a real anniversary and no sequence membership still qualifies (sequence is not required)',
  anniversaryNoSequence.length === 1 && anniversaryNoSequence[0].sequenceContext === null);

console.log('\n--- MIRROR: referralReason enrichment text ---');
function referralReason(signal, activeSequenceName) {
  const base = signal.kind === 'anniversary'
    ? `${signal.years}-year ownership anniversary this week`
    : `Replied positively ${signal.daysAgo}d ago`;
  return activeSequenceName ? `${base} — currently on the ${activeSequenceName} follow-up` : base;
}
ok('reason with no sequence context is just the base signal reason',
  referralReason({ kind: 'anniversary', years: 1 }, null) === '1-year ownership anniversary this week');
ok('reason with sequence context appends it without changing the base claim',
  referralReason({ kind: 'anniversary', years: 1 }, 'Sold Customer Ownership') ===
  '1-year ownership anniversary this week — currently on the Sold Customer Ownership follow-up');

console.log('\n--- MIRROR: cross-source dedup (a contact with due work today is not also pitched a referral ask) ---');
function dedupReferralCandidates(dueSequenceContactIds, referralCandidateIds) {
  const exclude = new Set(dueSequenceContactIds);
  return referralCandidateIds.filter(id => !exclude.has(id));
}
const dueToday = ['contact-A', 'contact-B'];
const referralPool = ['contact-A', 'contact-C', 'contact-D'];
const deduped = dedupReferralCandidates(dueToday, referralPool);
ok('contact already represented by a due sequence touch is excluded from referral opportunities',
  !deduped.includes('contact-A'));
ok('contacts with no due sequence touch today still get considered for a referral opportunity',
  deduped.includes('contact-C') && deduped.includes('contact-D'));
ok('dedup does not drop unrelated candidates', deduped.length === 2);

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
