// Regression coverage for a hostile-audit finding: ContactsTab's call queue
// recorded a call outcome as successful in the UI (chooseOutcome set `outcome`
// immediately, unconditionally, before the writes ran) even when the
// underlying persistence failed — record() swallowed both writes to
// console.warn with no rep-visible feedback and no way to retry.
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

console.log('\n--- record() no longer swallows a persistence failure ---');
ok('record() is present in the file', !!recordMatch);
const recordBody = recordMatch ? recordMatch[0] : '';
ok('record() does not catch-and-warn around logContactTouch (old swallow pattern)',
  !/try\s*\{\s*await logContactTouch[\s\S]*?catch[\s\S]*?console\.warn/.test(recordBody));
ok('record() does not catch-and-warn around logInteraction (old swallow pattern)',
  !/try\s*\{\s*await logInteraction[\s\S]*?catch[\s\S]*?console\.warn/.test(recordBody));
ok('record() still calls both logContactTouch and logInteraction',
  /await logContactTouch\(/.test(recordBody) && /await logInteraction\(/.test(recordBody));

console.log('\n--- chooseOutcome never shows a recorded outcome when persistence fails ---');
ok('chooseOutcome() is present in the file', !!chooseOutcomeMatch);
const chooseBody = chooseOutcomeMatch ? chooseOutcomeMatch[0] : '';
ok('chooseOutcome wraps record() in a real try/catch (not try/finally only)',
  /try\s*\{[\s\S]*?await record\([\s\S]*?\}\s*catch/.test(chooseBody));
ok('a failed record() reverts the outcome pill (setOutcome(null)) so the UI does not claim success',
  /catch[\s\S]*?setOutcome\(null\)/.test(chooseBody));
ok('a failed record() surfaces a rep-visible error via queueError',
  /catch[\s\S]*?setQueueError\(/.test(chooseBody));
ok('chooseOutcome clears any stale error before a new attempt (preserves retryability)',
  /setQueueError\(null\)/.test(chooseBody));

console.log('\n--- openText still marks a genuinely-sent text as sent even if logging fails ---');
ok('openText() is present in the file', !!openTextMatch);
const openTextBody = openTextMatch ? openTextMatch[0] : '';
ok('a successful launchSms still sets textOpened before attempting to log it',
  /result === 'opened'[\s\S]*?setTextOpened\(true\)[\s\S]*?record\(/.test(openTextBody));
ok('a logging failure after a successful send is caught, not left unhandled',
  /record\('text'[\s\S]*?\}\s*catch/.test(openTextBody));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
