// Unit tests for the follow-up scheduling logic in logContactTouch
// (lib/v2/updateContact.ts). Mirrors the scheduling rules without
// touching Supabase.
//
//   npm run test:followup    (from PocketRepApp/)

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- mirrored scheduling logic from logContactTouch ----

function computeFollowUp(existingFollowup, outcome, nowMs) {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const hasFutureFollowup = existingFollowup != null && existingFollowup > today;

  if (outcome === 'wrong-number') return null;

  if (outcome === 'no-answer' || outcome === 'voicemail') {
    const oneDay = new Date(nowMs + 86_400_000).toISOString().slice(0, 10);
    if (hasFutureFollowup && existingFollowup <= oneDay) return existingFollowup;
    return oneDay;
  }

  // Default: 3-day, unless future date exists
  if (hasFutureFollowup) return existingFollowup;
  return new Date(nowMs + 3 * 86_400_000).toISOString().slice(0, 10);
}

// ---- test data ----
const NOW = new Date('2026-08-20T12:00:00Z').getTime();
const TODAY = '2026-08-20';
const TOMORROW = '2026-08-21';
const THREE_DAYS = '2026-08-23';
const FIVE_DAYS = '2026-08-25';
const YESTERDAY = '2026-08-19';

// ---- default behavior (no outcome) ----
ok('default: no existing → 3 days', computeFollowUp(null, null, NOW) === THREE_DAYS);
ok('default: past date → 3 days', computeFollowUp(YESTERDAY, null, NOW) === THREE_DAYS);
ok('default: today → 3 days', computeFollowUp(TODAY, null, NOW) === THREE_DAYS);
ok('default: future date preserved', computeFollowUp(FIVE_DAYS, null, NOW) === FIVE_DAYS);
ok('default: tomorrow preserved', computeFollowUp(TOMORROW, null, NOW) === TOMORROW);

// ---- answered outcome (same as default) ----
ok('answered: no existing → 3 days', computeFollowUp(null, 'answered', NOW) === THREE_DAYS);
ok('answered: future preserved', computeFollowUp(FIVE_DAYS, 'answered', NOW) === FIVE_DAYS);

// ---- no-answer outcome ----
ok('no-answer: no existing → 1 day', computeFollowUp(null, 'no-answer', NOW) === TOMORROW);
ok('no-answer: past date → 1 day', computeFollowUp(YESTERDAY, 'no-answer', NOW) === TOMORROW);
ok('no-answer: sooner existing kept', computeFollowUp(TOMORROW, 'no-answer', NOW) === TOMORROW);
ok('no-answer: later future → 1 day', computeFollowUp(FIVE_DAYS, 'no-answer', NOW) === TOMORROW);

// ---- voicemail outcome (same as no-answer) ----
ok('voicemail: no existing → 1 day', computeFollowUp(null, 'voicemail', NOW) === TOMORROW);
ok('voicemail: future → 1 day', computeFollowUp(FIVE_DAYS, 'voicemail', NOW) === TOMORROW);

// ---- wrong-number outcome ----
ok('wrong-number: clears follow-up', computeFollowUp(null, 'wrong-number', NOW) === null);
ok('wrong-number: clears existing', computeFollowUp(FIVE_DAYS, 'wrong-number', NOW) === null);
ok('wrong-number: clears past', computeFollowUp(YESTERDAY, 'wrong-number', NOW) === null);

// ---- edge: Rex set follow-up to tomorrow, rep calls and gets voicemail ----
ok('voicemail doesnt push sooner follow-up later', computeFollowUp(TOMORROW, 'voicemail', NOW) === TOMORROW);

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${17} checks)`);
process.exit(failures ? 1 : 0);
