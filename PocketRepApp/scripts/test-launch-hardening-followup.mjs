// Regression coverage for the V1 launch-hardening follow-up pass:
//   1. generateQueue() (lib/messageQueue.ts) fails closed on do_not_contact,
//      not just is_deleted — call/email queue items were reaching a DNC
//      contact with zero gate (only the text channel was protected,
//      downstream, by smsLauncher's own re-check).
//   2. The Sequences tab's saved/cached queue (app/(tabs)/sequences.tsx)
//      re-validates do_not_contact/is_deleted live before rendering a
//      same-day cached queue, so a contact who became DNC after the queue
//      was generated never shows up as actionable until the cache expires.
//   3. Rex-initiated Smart Blast drafting (AppShell.tsx openBlastFromRex)
//      excludes DNC contacts before drafting, not just at send time.
//   4. weeklyDigest.ts no longer silently upserts a zeroed digest over a
//      correct one when either underlying query errors.
//   5. The new outbound_sms_actions terminal-status trigger's logic is
//      exercised directly (JS mirror) against every legitimate and
//      illegitimate transition this repo's own code can produce.
//
//   npm run test:launchhardening    (from PocketRepApp/)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
function inc(label, source, needles) { for (const n of needles) ok(`${label}: has "${n.slice(0, 60)}"`, source.includes(n)); }
function exc(label, source, needles) { for (const n of needles) ok(`${label}: lacks "${n.slice(0, 60)}"`, !source.includes(n)); }

const messageQueue = readFileSync(resolve(appRoot, 'lib/messageQueue.ts'), 'utf8');
const sequencesTab = readFileSync(resolve(appRoot, 'app/(tabs)/sequences.tsx'), 'utf8');
const appShell = readFileSync(resolve(appRoot, 'components/v2/AppShell.tsx'), 'utf8');
const weeklyDigest = readFileSync(resolve(appRoot, 'lib/v2/weeklyDigest.ts'), 'utf8');
const smsMigration = readFileSync(
  resolve(appRoot, 'supabase/migrations/20260906000000_lock_outbound_sms_terminal_status.sql'),
  'utf8',
);

console.log('\n--- generateQueue() fails closed on do_not_contact (call/email/text alike) ---');
inc('messageQueue', messageQueue, [
  "select('id,first_name,last_name,phone,email,vehicle,trim,trade_in,vehicle_year,vehicle_make,vehicle_model,lease_end_date,is_deleted,do_not_contact,is_demo')",
  'if (!contact || contact.is_deleted || contact.do_not_contact) continue;',
]);

console.log('\n--- Sequences tab re-validates a same-day cached queue against live DNC/deleted status ---');
inc('sequences.tsx', sequencesTab, [
  "select('id,is_deleted,do_not_contact')",
  'blocked.has(i.contact_id)',
  'removedBeforePos',
]);

console.log('\n--- Rex-initiated blast drafting excludes DNC contacts ---');
inc('AppShell (openBlastFromRex)', appShell, [
  'payload.contact_ids.includes(contact.id) && !contact.doNotContact',
]);

console.log('\n--- Backing out of the sold-book Rex mission before finishing clears mission state ---');
inc('AppShell (mission stale-state)', appShell, [
  // closeTopOverlay's back-gesture path
  'if (rexCoachOpen) {\n      setRexCoachOpen(false);',
  // RexCoach's own onClose prop
  "<RexCoach open={rexCoachOpen} onClose={() => {\n        setRexCoachOpen(false);",
]);
// Both close paths must clear mission state -- count occurrences directly so
// a future edit that removes just one of the two can't slip through.
{
  const pattern = /if \(soldBookMission\) \{ setSoldBookMission\(null\); setSoldBookMissionIds\(\[\]\); \}/g;
  const count = (appShell.match(pattern) ?? []).length;
  ok('mission-clear-on-close appears at both RexCoach close paths (>= 3: back-gesture, onClose prop, onFinishMission)', count >= 3);
}

console.log('\n--- weekly digest never overwrites a good digest with a zeroed one on a read error ---');
inc('weeklyDigest', weeklyDigest, [
  'if (dealsRes.error) throw dealsRes.error;',
  'if (contactsRes.error) throw contactsRes.error;',
]);

console.log('\n--- outbound_sms_actions terminal-status migration is structurally correct ---');
inc('sms migration', smsMigration, [
  'before update on public.outbound_sms_actions',
  "old.status is distinct from 'opened' and new.status is distinct from old.status",
]);

// ---- JS mirror of the trigger's allow/block decision -----------------------
// Mirrors: `if old.status is distinct from 'opened' and new.status is
// distinct from old.status then raise exception`.
function triggerAllows(oldStatus, newStatus) {
  const oldIsOpened = oldStatus === 'opened';
  const statusChanging = newStatus !== oldStatus;
  return !(!oldIsOpened && statusChanging);
}

console.log('\n--- SMS terminal-status trigger: legitimate transitions (the only 2 the app ever performs) ---');
ok("opened -> confirmed_sent allowed (markSmsSent)", triggerAllows('opened', 'confirmed_sent'));
ok("opened -> not_sent allowed (markSmsNotSent)", triggerAllows('opened', 'not_sent'));
ok("opened -> opened allowed (no-op)", triggerAllows('opened', 'opened'));

console.log('\n--- SMS terminal-status trigger: same-value updates to a terminal row stay allowed (completed_at touch-ups) ---');
for (const s of ['confirmed_sent', 'not_sent', 'failed', 'no_phone', 'blocked_unsafe', 'simulated_sent', 'sent']) {
  ok(`${s} -> ${s} (no status change) allowed`, triggerAllows(s, s));
}

console.log('\n--- SMS terminal-status trigger: every terminal status is locked against every other status ---');
const terminal = ['confirmed_sent', 'not_sent', 'failed', 'no_phone', 'blocked_unsafe', 'simulated_sent', 'sent'];
const anyStatus = [...terminal, 'opened'];
let terminalLockChecks = 0;
for (const from of terminal) {
  for (const to of anyStatus) {
    if (to === from) continue;
    ok(`${from} -> ${to} blocked`, !triggerAllows(from, to));
    terminalLockChecks++;
  }
}
ok('exercised every terminal x non-matching-status combination', terminalLockChecks === terminal.length * (anyStatus.length - 1));

console.log('\n--- SMS terminal-status trigger: cannot resurrect a terminal row back to opened ---');
for (const s of terminal) ok(`${s} -> opened blocked`, !triggerAllows(s, 'opened'));

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nLaunch-hardening follow-up guard OK: DNC fail-closed on every queue/blast path, stale saved-queue re-validation, honest weekly digest on read errors, and the outbound-SMS terminal-status lock proven against every transition the app can produce.');
