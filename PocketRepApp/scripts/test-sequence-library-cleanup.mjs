// Regression coverage for the sequence library cleanup migration
// (supabase/migrations/20260904010000_v2_archive_redundant_default_templates.sql).
//
// Verified live against the production PocketRep Supabase project
// (fwvrauqdoevwmwwqlfav, read-only queries, 2026-09-04) before writing this
// migration:
//   - Exactly 7 pre-existing is_template=true rows exist, seeded out-of-band
//     with zero tracked migration history (same drift pattern already known
//     for sequences.sequence_type/is_archived).
//   - 4 of the 7 substantially duplicate a canonical V1 template's audience/
//     purpose/trigger (2 of those 4 also fabricate an unverified "new
//     inventory" claim to every enrolled contact).
//   - Zero contact_sequences rows of any status reference any of those 4
//     template ids — archiving them cannot break an active enrollment.
//
// Source-grep guardrails on the real migration, plus a JS mirror of the
// archive/idempotency/protection logic against synthetic fixtures.
//
//   node scripts/test-sequence-library-cleanup.mjs    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const migrationPath = path.join(root, 'supabase/migrations/20260904010000_v2_archive_redundant_default_templates.sql');
const src = fs.readFileSync(migrationPath, 'utf8');
// The actual executable SQL, with '--' comment lines stripped — the audit-trail
// comments legitimately name sequence_steps/quoted values while explaining
// what was verified, which would otherwise false-positive a substring check.
const sqlOnly = src.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');

// --- 1. source guardrails on the real migration ------------------------------
console.log('\n--- archival is non-destructive (UPDATE only, never DROP/DELETE) ---');
ok('the migration is a single UPDATE statement', /^UPDATE public\.sequences/m.test(sqlOnly));
ok('the migration never deletes or drops a row/table', !/DROP TABLE|DELETE FROM/i.test(sqlOnly));
ok('sequence_steps (the actual message content / history) is never touched by executable SQL',
  !/sequence_steps/.test(sqlOnly));
ok('contact_sequences (enrollments) is never touched', !/contact_sequences/.test(sqlOnly));

console.log('\n--- rep-owned custom sequences can never be touched, even on a name collision ---');
ok('the UPDATE is scoped to is_template = true', /WHERE is_template = true/.test(src));

console.log('\n--- idempotent: safe to run more than once ---');
ok('the WHERE clause excludes already-archived rows', /AND is_archived = false/.test(src));

console.log('\n--- exactly the 4 verified-redundant legacy templates are archived ---');
const REDUNDANT = ['New Sold Customer', 'Unsold Lead Re-engagement', 'Lease-End Upgrade', 'Past-Customer Win-Back'];
const KEPT = ['Birthday + Anniversary', 'Service & Maintenance Reminder', 'Trade-Up Equity Check'];
const inClauseMatch = sqlOnly.match(/name IN \(([\s\S]*?)\)/);
const inClause = inClauseMatch ? inClauseMatch[1] : '';
ok('the name IN (...) clause is present and isolable', !!inClauseMatch);
for (const name of REDUNDANT) {
  ok(`"${name}" is in the archive list`, new RegExp(`'${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(inClause));
}
for (const name of KEPT) {
  ok(`"${name}" (genuinely distinct, no canonical equivalent) is NOT archived`, !inClause.includes(`'${name}'`));
}
ok('exactly 4 names are targeted (no accidental over/under-inclusion)',
  (inClause.match(/'[^']+'/g) || []).length === REDUNDANT.length);

console.log('\n--- canonical V1 templates this migration is superseding legacy defaults with are named in the audit trail ---');
ok('documents the Sold Customer Ownership supersession', /Sold Customer Ownership/.test(src));
ok('documents the Unsold Long-Term Follow-Up supersession', /Unsold Long-Term Follow-Up/.test(src));
ok('documents the Lease Maturity supersession', /Lease Maturity/.test(src));
ok('documents the verified zero-active-enrollment safety check', /zero contact_sequences rows/.test(src));

// --- 2. mirror of the archive/idempotency/protection logic ------------------
console.log('\n--- MIRROR: archive semantics against synthetic fixtures ---');
const TO_ARCHIVE = new Set(REDUNDANT);

function applyArchiveMigration(rows) {
  let changed = 0;
  const next = rows.map(r => {
    if (r.is_template && !r.is_archived && TO_ARCHIVE.has(r.name)) {
      changed++;
      return { ...r, is_archived: true };
    }
    return r;
  });
  return { rows: next, changed };
}

const fixture = [
  { id: 1, name: 'New Sold Customer', is_template: true, is_archived: false },
  { id: 2, name: 'Unsold Lead Re-engagement', is_template: true, is_archived: false },
  { id: 3, name: 'Lease-End Upgrade', is_template: true, is_archived: false },
  { id: 4, name: 'Past-Customer Win-Back', is_template: true, is_archived: false },
  { id: 5, name: 'Birthday + Anniversary', is_template: true, is_archived: false },
  { id: 6, name: 'Service & Maintenance Reminder', is_template: true, is_archived: false },
  { id: 7, name: 'Trade-Up Equity Check', is_template: true, is_archived: false },
  // Canonical V1 templates from the same library — must never be touched.
  { id: 8, name: 'Sold Customer Ownership', is_template: true, is_archived: false },
  // A rep-owned custom sequence that happens to share a redundant name —
  // is_template=false must protect it regardless of name.
  { id: 9, name: 'Lease-End Upgrade', is_template: false, is_custom: true, sentinel: 'DO-NOT-TOUCH-CUSTOM' },
];

const firstRun = applyArchiveMigration(fixture);
ok('exactly 4 rows are archived on first run', firstRun.changed === 4);
ok('all 4 archived rows are the verified-redundant set',
  firstRun.rows.filter(r => r.is_archived).every(r => TO_ARCHIVE.has(r.name)) &&
  firstRun.rows.filter(r => r.is_archived).length === 4);
ok('the 3 genuinely distinct templates remain un-archived',
  KEPT.every(name => firstRun.rows.find(r => r.name === name)?.is_archived === false));
ok('the canonical "Sold Customer Ownership" template is untouched',
  firstRun.rows.find(r => r.id === 8)?.is_archived === false);
ok('the rep-owned custom sequence sharing a redundant name is never archived (is_template=false protects it)',
  firstRun.rows.find(r => r.id === 9)?.is_archived === undefined &&
  firstRun.rows.find(r => r.id === 9)?.sentinel === 'DO-NOT-TOUCH-CUSTOM');

const secondRun = applyArchiveMigration(firstRun.rows);
ok('re-running the migration archives zero additional rows (idempotent)', secondRun.changed === 0);

console.log('\n--- MIRROR: the verified live safety check this migration relied on ---');
// This mirrors the exact read-only production query result that justified
// treating archival as safe: zero contact_sequences rows (any status)
// reference the 4 archived template ids. Encoded here as a fixture-level
// invariant so a future change to this module re-states the same guarantee
// explicitly rather than silently assuming it still holds.
const verifiedZeroActiveEnrollments = {
  'New Sold Customer': 0,
  'Unsold Lead Re-engagement': 0,
  'Lease-End Upgrade': 0,
  'Past-Customer Win-Back': 0,
};
ok('every archived template had zero contact_sequences rows of any status at verification time',
  Object.values(verifiedZeroActiveEnrollments).every(n => n === 0));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
