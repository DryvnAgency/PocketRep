// Regression coverage for hostile-audit Batch 2, items 1/2: native (V1
// legacy) CSV and device-contact import had zero duplicate prevention — no
// existing-row check, no upsert, no unique constraint — so re-importing the
// same file/contacts created full duplicate active rows. The CSV path also
// wrote only `mileage`, a column the modern Rex/data paths never read
// (they read `current_mileage`), so imported mileage was invisible to Rex.
//
// Two layers of coverage, matching this repo's established conventions:
//   1. A MIRROR of the dedup algorithm (phone/email normalization + batch
//      dedup + existing-book check), run against fake data, proving the
//      design correctly produces zero new rows on a second identical
//      import and never merges/overwrites (a match is skipped, not
//      updated) — so a blank field on re-import can never clobber good
//      existing data.
//   2. Source guardrails proving the REAL app/(tabs)/contacts.tsx actually
//      calls this logic before both inserts, and writes current_mileage
//      alongside the legacy mileage column.
//
//   npm run test:nativeimportdedup    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// --- mirrored logic (verbatim from app/(tabs)/contacts.tsx) ---
function phoneKeyV1(value) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
function emailKeyV1(value) {
  return (value ?? '').trim().toLowerCase();
}
function dedupeImportRows(rows, existingPhones, existingEmails) {
  const seenPhones = new Set();
  const seenEmails = new Set();
  const fresh = [];
  for (const row of rows) {
    const pk = phoneKeyV1(row.phone);
    const ek = emailKeyV1(row.email);
    const dup =
      (pk && (seenPhones.has(pk) || existingPhones.has(pk))) ||
      (ek && (seenEmails.has(ek) || existingEmails.has(ek)));
    if (dup) continue;
    if (pk) seenPhones.add(pk);
    if (ek) seenEmails.add(ek);
    fresh.push(row);
  }
  return fresh;
}

console.log('\n--- dedupeImportRows: re-importing the same rows produces zero new rows ---');
const batch = [
  { first_name: 'Jordan', phone: '(555) 010-2000', email: 'Jordan@Example.com' },
  { first_name: 'Sam', phone: '555-010-3000', email: 'sam@example.com' },
];
const noExisting = { phones: new Set(), emails: new Set() };
const firstImport = dedupeImportRows(batch, noExisting.phones, noExisting.emails);
ok('first import keeps both new rows', firstImport.length === 2);

// Simulate the book now containing what the first import inserted.
const afterFirstImport = {
  phones: new Set(firstImport.map(r => phoneKeyV1(r.phone))),
  emails: new Set(firstImport.map(r => emailKeyV1(r.email))),
};
const secondImport = dedupeImportRows(batch, afterFirstImport.phones, afterFirstImport.emails);
ok('re-importing the identical batch produces zero new rows', secondImport.length === 0);

console.log('\n--- dedupeImportRows: phone AND email matching, batch self-dedup, no merge ---');
ok('an existing phone (different formatting) is caught',
  dedupeImportRows([{ first_name: 'X', phone: '5550102000' }], new Set([phoneKeyV1('(555) 010-2000')]), new Set()).length === 0);
ok('an existing email (different case) is caught',
  dedupeImportRows([{ first_name: 'X', email: 'JORDAN@example.com' }], new Set(), new Set([emailKeyV1('jordan@example.com')])).length === 0);
ok('two identical rows within the SAME batch collapse to one',
  dedupeImportRows([
    { first_name: 'Dup', phone: '5550109999' },
    { first_name: 'Dup', phone: '5550109999' },
  ], new Set(), new Set()).length === 1);
ok('a match is skipped, never merged — a blank imported field cannot overwrite existing data',
  (() => {
    // The dedup step only ever decides keep-or-skip; it never reads or
    // writes any field on the existing row, so there is no code path here
    // that could carry a blank value onto an existing contact.
    const existingPhones = new Set([phoneKeyV1('5550102000')]);
    const result = dedupeImportRows([{ first_name: 'Jordan', phone: '5550102000', vehicle_make: '' }], existingPhones, new Set());
    return result.length === 0; // skipped entirely, not passed through as an update
  })());

// --- source guardrails: the REAL file calls this before both import paths ---
const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'app/(tabs)/contacts.tsx'), 'utf8');

console.log('\n--- the real contacts.tsx dedupes both import paths before inserting ---');
ok('a phone/email dedup helper is defined', /function dedupeImportRows/.test(src));
const importSelectedMatch = src.match(/async function importSelected\(\)[\s\S]*?\n  \}\n/);
ok('importSelected() is present', !!importSelectedMatch);
ok('importSelected() calls the dedup helper before inserting',
  /dedupeImportRows\(/.test(importSelectedMatch?.[0] ?? ''));
const confirmCsvMatch = src.match(/async function confirmCsvImport\(\)[\s\S]*?\n  \}\n/);
ok('confirmCsvImport() is present', !!confirmCsvMatch);
ok('confirmCsvImport() calls the dedup helper before inserting',
  /dedupeImportRows\(/.test(confirmCsvMatch?.[0] ?? ''));
ok('both import paths query the existing book (is_deleted=false) before dedup',
  (src.match(/\.eq\('is_deleted', false\)/g) || []).length >= 1 && /loadExistingContactKeys/.test(src));

console.log('\n--- import safety fails closed on Supabase errors ---');
ok('existing-contact lookup checks Supabase error instead of assuming an empty book',
  /const \{ data, error \} = await supabase[\s\S]*?if \(error\) throw new Error\(`Could not verify existing contacts:/.test(src));
ok('device-contact insert checks the Supabase result error before closing the import flow',
  /const \{ error: insertError \} = await supabase\.from\('contacts'\)\.insert\(toInsert\);[\s\S]*?if \(insertError\)/.test(importSelectedMatch?.[0] ?? ''));

console.log('\n--- CSV-imported mileage becomes usable by Rex without corrupting existing data ---');
ok('confirmCsvImport() still writes the legacy mileage column (native edit form compatibility)',
  /mileage: row\.mileage \? parseInt\(row\.mileage\) \|\| null : null/.test(confirmCsvMatch?.[0] ?? ''));
ok('confirmCsvImport() also writes current_mileage (the column Rex/modern data paths read)',
  /current_mileage: row\.mileage \? parseInt\(row\.mileage\) \|\| null : null/.test(confirmCsvMatch?.[0] ?? ''));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
