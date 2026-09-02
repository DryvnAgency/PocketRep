// Regression coverage for a hostile-audit finding: the Nurture Reviewer could
// surface — and send — a draft to a contact the rep had already soft-deleted
// or flagged do-not-contact. loadPendingNurtures' query had no is_deleted/
// do_not_contact filter, and launchSms (the shared SMS-launch chokepoint used
// by nine call sites across the app) did no re-check of its own, so a draft
// queued while a contact was still active would still fire once reviewed.
//
// Source guardrails (same pattern as test-contact-lifecycle.mjs): this is a
// Supabase query-builder chain and a live DB check, not a pure function, so
// there is no meaningful way to mirror it without a real Postgres/RLS
// backend — asserting on the real source is the correct tool here.
//
//   npm run test:nurturesafety    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const nurtureSrc = fs.readFileSync(path.join(root, 'lib/v2/nurtureEngine.ts'), 'utf8');
const launcherSrc = fs.readFileSync(path.join(root, 'lib/v2/smsLauncher.ts'), 'utf8');
const actionsSrc = fs.readFileSync(path.join(root, 'lib/v2/smsActions.ts'), 'utf8');

console.log('\n--- loadPendingNurtures never surfaces a deleted or DNC contact ---');
// Isolate just the loadPendingNurtures function body so a filter elsewhere in
// the file (e.g. on a different query) can't make this pass by accident.
const fnMatch = nurtureSrc.match(/export async function loadPendingNurtures[\s\S]*?\n}\n/);
ok('loadPendingNurtures is present in the file', !!fnMatch);
const fnBody = fnMatch ? fnMatch[0] : '';
ok('the query embeds is_deleted/do_not_contact so they can be filtered or read',
  /is_deleted/.test(fnBody) && /do_not_contact/.test(fnBody));
ok('the query filters out soft-deleted contacts (embedded-resource filter)',
  /\.eq\(\s*['"]contacts\.is_deleted['"]\s*,\s*false\s*\)/.test(fnBody));
ok('the query filters out do-not-contact contacts (embedded-resource filter)',
  /\.eq\(\s*['"]contacts\.do_not_contact['"]\s*,\s*false\s*\)/.test(fnBody));

console.log('\n--- launchSms re-checks contact safety as close to send as practical ---');
ok('launchSms queries the contacts table for a live safety check before sending',
  /launchSms[\s\S]*?from\(\s*['"]contacts['"]\s*\)[\s\S]*?is_deleted/.test(launcherSrc));
ok('launchSms refuses to send when the contact is deleted or do-not-contact',
  /if\s*\(\s*safety\?\.is_deleted\s*\|\|\s*safety\?\.do_not_contact\s*\)/.test(launcherSrc));
ok('a blocked send returns a distinct result (never silently treated as opened)',
  /'blocked'/.test(launcherSrc) && /SmsLaunchResult\s*=[^;]*'blocked'/.test(launcherSrc));
ok('a demo/tour contact still bypasses the live check (simulated sends are exempt)',
  /if\s*\(\s*draft\.isDemo\s*\)\s*return\s*'opened'/.test(launcherSrc));

console.log('\n--- the block is recorded for audit, not just silently dropped ---');
ok('smsActions records a distinct failure status for a safety-blocked send',
  /blocked_unsafe/.test(actionsSrc));
ok('recordSmsFailure accepts the blocked-unsafe status',
  /status:\s*'failed'\s*\|\s*'no_phone'\s*\|\s*'blocked_unsafe'/.test(actionsSrc));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
