// Regression coverage for a hostile-audit finding: ContactsTab's call queue
// recorded a call outcome as successful in the UI (chooseOutcome set `outcome`
// immediately, unconditionally, before the writes ran) even when the
// underlying persistence failed — record() swallowed both writes to
// console.warn with no rep-visible feedback and no way to retry.
//
// Owner review on PR #141 caught a follow-on risk in the first fix: the two
// writes are SEQUENTIAL (logContactTouch, the primary follow-up-scheduling
// write, then logInteraction, a secondary history/audit row), so
// logContactTouch can succeed while logInteraction fails. Treating either
// failure as "the outcome didn't persist" reset the outcome and invited a
// retry that would re-run logContactTouch — already-successful — a second
// time. Only the PRIMARY write's failure may reset/retry; a secondary-only
// failure must preserve the recorded outcome and just warn.
//
// Source guardrails (same pattern as test-contact-lifecycle.mjs): the real
// behavior is two async Supabase writes plus React state, not a pure
// function, so asserting on the real control flow is the correct tool.
//
//   npm run test:calloutcome    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'components/v2/ContactsTab.tsx'), 'utf8');

const recordMatch = src.match(/const record = async[\s\S]*?\n  \};\n/);
const chooseOutcomeMatch = src.match(/const chooseOutcome = async[\s\S]*?\n  \};\n/);
const openTextMatch = src.match(/const openText = async[\s\S]*?\n  \};\n/);

console.log('\n--- record() distinguishes the primary write from the secondary log ---');
ok('record() is present in the file', !!recordMatch);
const recordBody = recordMatch ? recordMatch[0] : '';
ok('record() awaits logContactTouch unwrapped, so a primary failure propagates',
  /await logContactTouch\([^;]*\);(?![\s\S]*catch[\s\S]{0,5}logContactTouch)/.test(recordBody));
ok('record() catches a logInteraction failure locally instead of letting it propagate',
  /try\s*\{[^}]*await logInteraction\([\s\S]*?\}\s*catch/.test(recordBody));
ok('record() reports a secondary-log failure via its return value, not by throwing it',
  /interactionLogFailed/.test(recordBody));
ok('record() still calls both logContactTouch and logInteraction',
  /await logContactTouch\(/.test(recordBody) && /await logInteraction\(/.test(recordBody));

console.log('\n--- chooseOutcome never shows a recorded outcome when the PRIMARY write fails ---');
ok('chooseOutcome() is present in the file', !!chooseOutcomeMatch);
const chooseBody = chooseOutcomeMatch ? chooseOutcomeMatch[0] : '';
ok('chooseOutcome wraps record() in a real try/catch (not try/finally only)',
  /try\s*\{[\s\S]*?await record\([\s\S]*?\}\s*catch/.test(chooseBody));
ok('a primary-write failure reverts the outcome pill (setOutcome(null)) so the UI does not claim success',
  /catch[\s\S]*?setOutcome\(null\)/.test(chooseBody));
ok('a primary-write failure surfaces a rep-visible error via queueError',
  /catch[\s\S]*?setQueueError\(/.test(chooseBody));
ok('chooseOutcome clears any stale error before a new attempt (preserves retryability)',
  /setQueueError\(null\)/.test(chooseBody));

console.log('\n--- PR #141 review: primary succeeds, secondary fails — no duplicate-prone retry state ---');
ok('chooseOutcome reads interactionLogFailed back from record()',
  /const\s*\{\s*interactionLogFailed\s*\}\s*=\s*await record\(/.test(chooseBody));
const secondaryBranchMatch = chooseBody.match(/if\s*\(\s*interactionLogFailed\s*\)\s*\{([\s\S]*?)\}/);
ok('a secondary-only failure branch exists', !!secondaryBranchMatch);
const secondaryBranch = secondaryBranchMatch ? secondaryBranchMatch[1] : '';
ok('a secondary-only failure does NOT reset the outcome (no duplicate-prone retry of the primary write)',
  !/setOutcome\(null\)/.test(secondaryBranch));
ok('a secondary-only failure still surfaces a rep-visible warning',
  /setQueueError\(/.test(secondaryBranch));
ok('setOutcome(null) appears only in the primary-failure catch block, never in the secondary branch',
  (chooseBody.match(/setOutcome\(null\)/g) || []).length === 1);

console.log('\n--- openText still marks a genuinely-sent text as sent even if logging fails ---');
ok('openText() is present in the file', !!openTextMatch);
const openTextBody = openTextMatch ? openTextMatch[0] : '';
ok('a successful launchSms still sets textOpened before attempting to log it',
  /result === 'opened'[\s\S]*?setTextOpened\(true\)[\s\S]*?record\(/.test(openTextBody));
ok('a primary-write failure after a successful send is caught, not left unhandled',
  /record\('text'[\s\S]*?\}\s*catch/.test(openTextBody));
ok('a secondary-only failure after a successful send still warns (return value is checked, not ignored)',
  /interactionLogFailed/.test(openTextBody));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
