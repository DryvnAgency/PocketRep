/**
 * Source guardrails for the V1 contact lifecycle. Browser verification covers
 * the live authenticated flow; these checks keep the safety and honesty
 * contracts from regressing in later edits.
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
function ok(condition, label) {
  if (condition) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}`); }
}

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const persistence = read('lib/v2/updateContact.ts');
const importModal = read('components/v2/ImportContactsModal.tsx');
const detail = read('components/v2/ContactDetail.tsx');
const book = read('lib/v2/bookContext.ts');
const coach = read('components/v2/RexCoach.tsx');

ok(persistence.includes(".update({ is_deleted: true, updated_at: new Date().toISOString() })"),
  'delete removes a contact from the active book without erasing its history');
ok(persistence.includes(".eq('is_deleted', false)"),
  'delete is idempotently scoped to active contacts');
ok(persistence.includes(".select('id')") && persistence.includes("if (!data) throw new Error('Contact was not deleted."),
  'delete proves a row changed before the UI reports success');
ok(!/export async function deleteContact[\s\S]*?\.delete\(\)/.test(persistence),
  'contact delete does not hard-delete the database row');
ok(detail.includes('Their history stays protected.'),
  'confirmation copy accurately explains delete behavior');
ok(detail.includes('setDeleteError(') && detail.includes('accessibilityLiveRegion="polite"'),
  'failed delete remains visible and announced');

ok(importModal.includes('const busyRef = useRef(false)'),
  'contact import blocks double-submit races');
ok(importModal.includes("if (n === 0)") && importModal.includes('No new contacts were imported.'),
  'zero-row import stays open with an honest explanation');
ok(importModal.includes('accessibilityRole="checkbox"'),
  'import review rows expose selection state to assistive tech');

ok(book.includes(".eq('is_deleted', false)"),
  'Rex excludes deleted contacts from the active book context');
ok(coach.includes('Confirm') && coach.includes('Cancel'),
  'Rex write proposals keep rep confirmation controls');
ok(!coach.includes("'delete_contact'"),
  'Rex V1 text coach cannot propose destructive contact deletion');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
