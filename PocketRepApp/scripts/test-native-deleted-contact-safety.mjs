// Regression coverage for hostile-audit Batch 2, items 3/4/5/7: soft-deleted
// contacts leaking into native (V1 legacy) screens — the Heat Sheet
// (hot/warm/cold/follow-up + local notification scheduling), the sequence
// enrollment/mass-text picker, native Rex's whole-book context and
// show_followups action, the deal-logging contact picker, the book export,
// and the weekly "new contacts" digest count.
//
// Source guardrails (same pattern as test-contact-lifecycle.mjs): every one
// of these is a direct Supabase query with no pure-function equivalent to
// mirror, so asserting on the real query text is the correct tool.
//
//   npm run test:nativedeletedsafety    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const indexSrc = read('app/(tabs)/index.tsx');
const sequencesSrc = read('app/(tabs)/sequences.tsx');
const rexSrc = read('app/(tabs)/rex.tsx');
const dealsSrc = read('app/(tabs)/deals.tsx');
const moreSrc = read('app/(tabs)/more.tsx');

console.log('\n--- native Heat Sheet (index.tsx) excludes deleted contacts ---');
const loadFnMatch = indexSrc.match(/async function load\(\)[\s\S]*?\n  \}\n/);
ok('load() is present', !!loadFnMatch);
ok('the Heat Sheet contacts query filters is_deleted',
  /supabase\.from\('contacts'\)\.select\('\*'\)\.eq\('user_id', user\.id\)\.eq\('is_deleted', false\)/.test(loadFnMatch?.[0] ?? ''));
const notifFnMatch = indexSrc.match(/async function maybeSchedule\(\)[\s\S]*?\n    \}\n/);
ok('maybeSchedule() is present', !!notifFnMatch);
ok('the local-notification contacts query filters is_deleted',
  /\.from\('contacts'\)[\s\S]*?\.eq\('is_deleted', false\)/.test(notifFnMatch?.[0] ?? ''));

console.log('\n--- native sequence enrollment/mass-text picker excludes deleted contacts ---');
ok('the allContacts query filters is_deleted',
  /supabase\.from\('contacts'\)\.select\('id,first_name,last_name,phone'\)\.eq\('user_id', user\.id\)\.eq\('is_deleted', false\)/.test(sequencesSrc));

console.log('\n--- native Rex whole-book context excludes deleted contacts ---');
const loadAllMatch = rexSrc.match(/async function loadAll\(\)[\s\S]*?\n  \}\n/);
ok('loadAll() is present', !!loadAllMatch);
ok('the whole-book contacts query filters is_deleted',
  /supabase\.from\('contacts'\)\.select\('id,first_name,last_name,vehicle_year[^']*'\)\.eq\('user_id', user\.id\)\.eq\('is_deleted', false\)/.test(loadAllMatch?.[0] ?? ''));

console.log('\n--- native Rex show_followups action excludes deleted contacts ---');
const followupsMatch = rexSrc.match(/if \(action\.type === 'show_followups'\)[\s\S]*?\n    \}\n/);
ok('the show_followups branch is present', !!followupsMatch);
ok('the show_followups query filters is_deleted',
  /\.from\('contacts'\)[\s\S]*?\.eq\('is_deleted', false\)/.test(followupsMatch?.[0] ?? ''));

console.log('\n--- native deal picker / book export / weekly digest count (re-checked; fixed where product semantics agree) ---');
ok('the deal-logging contact picker excludes deleted contacts',
  /supabase\.from\('contacts'\)\.select\('id,first_name,last_name'\)\.eq\('user_id', user\.id\)\.eq\('is_deleted', false\)/.test(dealsSrc));
const exportMatch = moreSrc.match(/const \{ data: contacts \} = await supabase[\s\S]*?;/);
ok('the book export query is present', !!exportMatch);
ok('the book export query excludes deleted contacts',
  /\.eq\('is_deleted', false\)/.test(exportMatch?.[0] ?? ''));
ok('the weekly digest "new contacts" count excludes deleted contacts',
  /supabase\.from\('contacts'\)\.select\('id,first_name,last_name,heat_tier'\)\.eq\('user_id', user\.id\)\.eq\('is_deleted', false\)\.gte\('created_at', oneWeekAgo\)/.test(moreSrc));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
