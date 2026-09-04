// Regression coverage for the Work My Book expansion (lib/v2/workMyBook.ts):
// two new opportunity sources — real due sequence touches (reusing the
// actual sequence/enrollment engine) and referral opportunities gated on a
// real, saved positive relationship signal.

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'lib/v2/workMyBook.ts'), 'utf8');

console.log('\n--- due sequence touches reuse the real sequence/enrollment engine ---');
ok('imports generateQueue from the real message queue instead of reinventing it',
  /import \{ generateQueue, type QueueItem \} from '@\/lib\/messageQueue';/.test(src));
ok('does not redefine generateQueue locally', !/function generateQueue/.test(src));
ok('getDueSequenceOpportunities defensively re-checks do_not_contact/is_deleted before surfacing',
  /getDueSequenceOpportunities[\s\S]*?is_deleted,do_not_contact/.test(src));

console.log('\n--- compliance suppression ---');
ok('isSuppressed checks is_deleted', /function isSuppressed/.test(src) && /!!c\.is_deleted/.test(src));
ok('isSuppressed checks do_not_contact', /!!c\.do_not_contact/.test(src));
ok("dead and kill decisions are suppressed", /DEAD_DECISIONS = new Set\(\['dead', 'kill'\]\)/.test(src));
ok('referral candidates require past-customer, active, non-DNC state',
  /\.eq\('is_past_customer', true\)/.test(src) && /\.eq\('is_deleted', false\)/.test(src) && /\.eq\('do_not_contact', false\)/.test(src));
ok('referral query is scoped to the calling rep', /\.eq\('user_id', userId\)/.test(src));

console.log('\n--- referral eligibility uses saved positive signals only ---');
ok('ownership sequence allowlist is post-sale context only',
  /OWNERSHIP_CONTEXT_SEQUENCE_NAMES = \[\s*'Sold Customer Ownership',\s*'New Vehicle Delivery',\s*'Second Delivery',\s*'Lease Maturity',?\s*\];/.test(src));
ok('anniversary comes from deals.closed_at', /computeAnniversarySignal\(d\.closed_at, today\)/.test(src));
ok('positive reply requires reply_sentiment=positive', /\.eq\('reply_sentiment', 'positive'\)/.test(src));
ok('does not infer satisfaction from heat score or silence', !/heat_score/.test(src) && !/days_silent/.test(src));
ok('ReferralSignal has only anniversary and positive_reply kinds',
  /type ReferralSignal =\s*\n\s*\| \{ kind: 'anniversary'; years: number \}\s*\n\s*\| \{ kind: 'positive_reply'; daysAgo: number \};/.test(src));
const signalsLoopMatch = src.match(/const signalsByContact = new Map[\s\S]*?const sequenceNameByContact/);
const signalsLoop = signalsLoopMatch ? signalsLoopMatch[0] : '';
ok('sequence enrollment never grants eligibility', !!signalsLoopMatch && !/enrollments/.test(signalsLoop));
ok('sequence membership only enriches reason text',
  /referralReason\(signal, sequenceNameByContact\.get\(contactId\) \?\? null\)/.test(src));

console.log('\n--- truth-safe wording and no auto-send ---');
ok('referral ask is conditional', /if you know anyone else in the market/.test(src));
ok('no promo/discount/fake urgency language',
  !/\b(discount|% off|sale price|limited time|promo|deal ends|hurry|act now|last chance)\b/i.test(src));
const openerFnMatch = src.match(/export function buildReferralOpener\([\s\S]*?\n\}/);
const openerFn = openerFnMatch ? openerFnMatch[0] : '';
ok('generated opener avoids inventory and appointment claims',
  !!openerFnMatch && !/\binventory\b/i.test(openerFn) && !/\bappointment\b/i.test(openerFn));
ok('module does not directly launch or send',
  !/Linking\.openURL/.test(src) && !/launchSms\(/.test(src) && !/\bfetch\(/.test(src));

console.log('\n--- cross-source dedup ---');
ok('due-sequence contacts are excluded from referral pass',
  /getReferralOpportunities\(userId, dueSequence\.map\(o => o\.contact_id\)\)/.test(src));
ok('due sequence results are returned before referrals',
  src.indexOf('const dueSequence = await getDueSequenceOpportunities') < src.indexOf('const referral = await getReferralOpportunities'));

console.log('\n--- pure decision mirrors ---');
const DEAD_DECISIONS = new Set(['dead', 'kill']);
function isSuppressed(c) {
  return !!c.is_deleted || !!c.do_not_contact || DEAD_DECISIONS.has(String(c.rep_decision ?? ''));
}
ok('deleted suppressed', isSuppressed({ is_deleted: true }));
ok('DNC suppressed', isSuppressed({ do_not_contact: true }));
ok('dead suppressed', isSuppressed({ rep_decision: 'dead' }));
ok('kill suppressed', isSuppressed({ rep_decision: 'kill' }));
ok('normal active contact not suppressed', !isSuppressed({ rep_decision: 'active' }));

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
const TODAY = new Date(Date.UTC(2026, 8, 4));
ok('1-year anniversary qualifies', computeAnniversarySignal('2025-09-04', TODAY)?.years === 1);
ok('outside anniversary window does not qualify', computeAnniversarySignal('2025-09-14', TODAY) === null);
ok('less than one year does not qualify', computeAnniversarySignal('2026-03-04', TODAY) === null);
ok('2-year anniversary qualifies', computeAnniversarySignal('2024-09-04', TODAY)?.years === 2);

const SIGNAL_PRIORITY = { anniversary: 0, positive_reply: 1 };
function strongestReferralSignal(signals) {
  if (signals.length === 0) return null;
  return signals.slice().sort((a, b) => SIGNAL_PRIORITY[a.kind] - SIGNAL_PRIORITY[b.kind])[0];
}
ok('anniversary wins when both signals exist',
  strongestReferralSignal([{ kind: 'positive_reply' }, { kind: 'anniversary', years: 1 }]).kind === 'anniversary');
ok('no saved signal means no referral opportunity', strongestReferralSignal([]) === null);

function dedupReferralCandidates(dueSequenceContactIds, referralCandidateIds) {
  const exclude = new Set(dueSequenceContactIds);
  return referralCandidateIds.filter(id => !exclude.has(id));
}
const deduped = dedupReferralCandidates(['contact-A', 'contact-B'], ['contact-A', 'contact-C', 'contact-D']);
ok('due contact removed from referral candidates', !deduped.includes('contact-A'));
ok('unrelated referral candidates preserved', deduped.includes('contact-C') && deduped.includes('contact-D'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
