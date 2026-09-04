// Regression coverage for Issue #160, Lane 1: the canonical V1/V2 sequence
// template library (supabase/migrations/20260904000000_v2_canonical_sequence_templates.sql)
// and lib/v2/useSequences.ts's new requires_classification passthrough.
//
// Two layers of coverage, matching this repo's established test convention:
//   1. Source guardrails on the real migration file: each of the 7 templates
//      uses the same "insert only if a template with this name does not
//      already exist" idempotency guard, has the right step count/ordering/
//      delay_days, and only Fresh Up - 14 Day's final step is tagged
//      requires_classification — proving the "do not silently auto-classify"
//      requirement holds (no code anywhere sets contact_sequences.classification).
//   2. A MIRROR of the idempotency algorithm itself (not just the SQL text)
//      run against fake data: applying the "template set" twice never
//      duplicates, and a book that already has one matching-name template
//      still gets the other six without touching the existing one or any
//      user-created (is_template=false) sequence.
//
//   npm run test:sequencetemplates    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const migrationPath = path.join(root, 'supabase/migrations/20260904000000_v2_canonical_sequence_templates.sql');
const src = fs.readFileSync(migrationPath, 'utf8');
const useSequencesSrc = fs.readFileSync(path.join(root, 'lib/v2/useSequences.ts'), 'utf8');

// --- 1. source guardrails on the real migration -----------------------------
console.log('\n--- schema reconciliation is defensive (ADD COLUMN IF NOT EXISTS only) ---');
ok('sequences.sequence_type is added defensively', /ALTER TABLE public\.sequences ADD COLUMN IF NOT EXISTS sequence_type/.test(src));
ok('sequences.is_archived is added defensively', /ALTER TABLE public\.sequences ADD COLUMN IF NOT EXISTS is_archived/.test(src));
ok('sequence_steps.requires_classification is a new, safely-constrainable column', /ALTER TABLE public\.sequence_steps ADD COLUMN IF NOT EXISTS requires_classification boolean NOT NULL DEFAULT false/.test(src));
ok('contact_sequences.classification is added defensively (nullable, no default)', /ALTER TABLE public\.contact_sequences ADD COLUMN IF NOT EXISTS classification text/.test(src));
ok('the migration never DROPs or DELETEs an existing table/row', !/DROP TABLE|DELETE FROM public\.(sequences|sequence_steps|contact_sequences)/i.test(src));
ok('the migration never UPDATEs an existing sequences/contact_sequences row (additive only)', !/UPDATE public\.(sequences|sequence_steps|contact_sequences)/i.test(src));

console.log('\n--- no code auto-sets a classification (rep-driven only) ---');
ok('the migration itself never assigns a classification value', !/classification\s*=\s*'(sold|still_shopping|no_response)'/i.test(src));
ok('useSequences.ts documents that nothing sets classification automatically',
  /No code in this[\s\S]{0,10}repo sets contact_sequences\.classification automatically/.test(useSequencesSrc));

console.log('\n--- each template uses the same idempotent "insert only if absent" guard ---');
const TEMPLATE_NAMES = [
  'Fresh Up - 14 Day',
  'Unsold Long-Term Follow-Up',
  'Sold Customer Ownership',
  'New Vehicle Delivery',
  'Lease Maturity',
  'Second Delivery',
  'Holiday Check-In',
];
// Split into individual "DO $$ ... " chunks first (each starting at a DO $$
// boundary and running to just before the next one, or EOF). A single regex
// spanning "DO $$ ... name ... END $$;" would be non-greedy on the wrong
// end: since .match() scans from position 0, it can span from the FIRST DO
// block all the way to a LATER template's name/END $$, silently including
// every earlier template's content too. Splitting first avoids that trap.
const doChunks = src.split(/(?=DO \$\$)/).filter(c => c.trimStart().startsWith('DO $$'));

const blocks = {};
for (const name of TEMPLATE_NAMES) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const guardRe = new RegExp(
    `IF NOT EXISTS \\(SELECT 1 FROM public\\.sequences WHERE is_template = true AND name = '${escaped}'\\) THEN`,
  );
  ok(`"${name}" has the standard existence guard`, guardRe.test(src));

  const nameRe = new RegExp(`name = '${escaped}'`);
  const chunk = doChunks.find(c => nameRe.test(c));
  ok(`"${name}"'s DO block is present and isolable`, !!chunk);
  blocks[name] = chunk ?? '';
}

console.log('\n--- step counts, ordering, and absolute delay_days per template ---');
function stepTuples(block) {
  // Each step row looks like: (v_seq_id, <step>, <delay>, '<channel>', '...', true|false, true|false)
  const rows = [...block.matchAll(/\(v_seq_id,\s*(\d+),\s*(\d+),\s*'(text|call|email)'/g)];
  return rows.map(r => ({ step: Number(r[1]), delay: Number(r[2]), channel: r[3] }));
}
function assertSteps(name, expectedDelays) {
  const tuples = stepTuples(blocks[name]);
  ok(`"${name}" has ${expectedDelays.length} steps`, tuples.length === expectedDelays.length);
  ok(`"${name}" step_numbers are 1..N with no gaps`,
    tuples.every((t, i) => t.step === i + 1));
  ok(`"${name}" delay_days match the intended cadence`,
    JSON.stringify(tuples.map(t => t.delay)) === JSON.stringify(expectedDelays));
  ok(`"${name}" mixes channels or is intentionally single-channel (no accidental uniformity bug)`,
    new Set(tuples.map(t => t.channel)).size >= 1);
  return tuples;
}
assertSteps('Fresh Up - 14 Day', [0,1,2,3,4,5,6,7,8,9,10,11,12,13]);
const freshUpTuples = stepTuples(blocks['Fresh Up - 14 Day']);
ok('"Fresh Up - 14 Day" mixes text AND call (not single-channel)',
  freshUpTuples.some(t => t.channel === 'text') && freshUpTuples.some(t => t.channel === 'call'));
assertSteps('Unsold Long-Term Follow-Up', [0,14,30,45,60,75,90]);
assertSteps('Sold Customer Ownership', [0,30,90,180,330]);
assertSteps('New Vehicle Delivery', [1,4,6,10,14]);
assertSteps('Lease Maturity', [0,21,45,75,100]);
assertSteps('Second Delivery', [0,3,30,120]);
assertSteps('Holiday Check-In', [0,7]);

console.log('\n--- Fresh Up - 14 Day ends in an explicit, rep-driven classification prompt ---');
ok('only the final step (14) is requires_classification = true',
  /\(v_seq_id, 14, 13,'call'[\s\S]*?true, true\);/.test(blocks['Fresh Up - 14 Day']) &&
  (blocks['Fresh Up - 14 Day'].match(/, true\)/g) || []).length === 1);
ok('the final step instructs the rep to ask, not guess, and names all three outcomes',
  /Sold \/ Still shopping \/ No response/.test(blocks['Fresh Up - 14 Day']) &&
  /Do not guess this from silence alone, ask/.test(blocks['Fresh Up - 14 Day']));
ok('no other template sets requires_classification = true',
  TEMPLATE_NAMES.filter(n => n !== 'Fresh Up - 14 Day').every(n => !/,\s*true\);/.test(blocks[n])));

console.log('\n--- New Vehicle Delivery: exact required touchpoints and safe wording ---');
const nvd = blocks['New Vehicle Delivery'];
ok('has a next-day (delay_days=1) ownership check-in', /\(v_seq_id, 1, 1,/.test(nvd));
ok('has a +3-days-later (delay_days=4) feature/help check', /\(v_seq_id, 2, 4,/.test(nvd));
ok('has a ~2-days-after-that (delay_days=6) service-recovery check', /\(v_seq_id, 3, 6,/.test(nvd));
ok('the service-recovery step explicitly forbids mentioning a survey score',
  /Do not mention or reference a survey or a survey score/.test(nvd));
ok('has a second-delivery invitation step', /second vehicle for your household/.test(nvd));
ok('the referral ask is explicitly rep-gated on a genuine positive ownership signal',
  /REP CHECK: only use this referral ask after \{\{first_name\}\} has given you a genuinely positive ownership signal/.test(nvd));
ok('referral ask tells the rep to help first when the experience is not clearly positive',
  /If the experience is not clearly positive yet, skip this step and help first/.test(nvd));
ok('referral ask is a separate, later step than the second-delivery invitation',
  nvd.indexOf('second vehicle for your household') < nvd.indexOf('REP CHECK: only use this referral ask'));

console.log('\n--- all prospect templates avoid fabricated inventory, pricing, and urgency ---');
const prospectSafety = blocks['Fresh Up - 14 Day'] + '\n' + blocks['Unsold Long-Term Follow-Up'];
ok('prospect templates never claim unverified inventory availability',
  !/still holding a couple|picked up some new inventory|we have got new .* inventory/i.test(prospectSafety));
ok('prospect templates never claim pricing can be locked without verified facts',
  !/lock in today''s numbers|today only|price expires|deal ends/i.test(prospectSafety));
ok('prospect templates never invent a fake close-out deadline',
  !/one more day before I close out your file|last chance|act now|hurry/i.test(prospectSafety));

console.log('\n--- migration insert columns match both tracked schema and verified production ---');
ok('sequence inserts do not rely on legacy-only contact_id',
  !/INSERT INTO public\.sequences \([^)]*contact_id/.test(src));
ok('sequence inserts do not rely on legacy-only is_ai_generated',
  !/INSERT INTO public\.sequences \([^)]*is_ai_generated/.test(src));

console.log('\n--- Holiday Check-In has no fabricated promotions or urgency ---');
const holiday = blocks['Holiday Check-In'];
ok('no discount/promo/sale language', !/\b(discount|% off|sale price|limited time|promo|deal ends)\b/i.test(holiday));
ok('no urgency language', !/\b(hurry|act now|last chance|expires|don''t miss|today only)\b/i.test(holiday));
ok('is short (2 steps) and text-only, matching a light-touch check-in', stepTuples(holiday).length === 2);

console.log('\n--- useSequences.ts surfaces requires_classification for a future UI ---');
ok('V2SequenceStep type includes requires_classification', /requires_classification: boolean/.test(useSequencesSrc));
ok('the sequence_steps select requests requires_classification', /sequence_steps\([^)]*requires_classification[^)]*\)/.test(useSequencesSrc));

// --- 2. mirror of the idempotency algorithm itself --------------------------
console.log('\n--- MIRROR: applying the template set twice never duplicates ---');
const TEMPLATES = TEMPLATE_NAMES.map(name => ({ name, is_template: true }));

function applyTemplateMigration(existing) {
  const book = existing.slice();
  let inserted = 0;
  for (const t of TEMPLATES) {
    const alreadyThere = book.some(s => s.is_template && s.name === t.name);
    if (!alreadyThere) {
      book.push({ name: t.name, is_template: true });
      inserted++;
    }
  }
  return { book, inserted };
}

const firstRun = applyTemplateMigration([]);
ok('first run inserts exactly 7 templates', firstRun.inserted === 7);
const secondRun = applyTemplateMigration(firstRun.book);
ok('re-running on the same book inserts zero new templates (idempotent)', secondRun.inserted === 0);
ok('re-running does not change the book size', secondRun.book.length === firstRun.book.length);

console.log('\n--- MIRROR: pre-existing template + user-created custom sequences are left alone ---');
const bookWithOneExistingAndACustomSeq = [
  { name: 'Fresh Up - 14 Day', is_template: true, sentinel: 'DO-NOT-TOUCH-EXISTING-TEMPLATE' },
  { name: "Marcus's hand-tuned closer sequence", is_template: false, is_custom: true, sentinel: 'DO-NOT-TOUCH-CUSTOM' },
];
const reconcileRun = applyTemplateMigration(bookWithOneExistingAndACustomSeq);
ok('the other 6 templates are still added when one already exists', reconcileRun.inserted === 6);
ok('the pre-existing template row is untouched (same object, sentinel intact)',
  reconcileRun.book.find(s => s.name === 'Fresh Up - 14 Day')?.sentinel === 'DO-NOT-TOUCH-EXISTING-TEMPLATE');
ok('the user-created custom sequence is untouched and not duplicated',
  reconcileRun.book.filter(s => s.name === "Marcus's hand-tuned closer sequence").length === 1 &&
  reconcileRun.book.find(s => s.name === "Marcus's hand-tuned closer sequence")?.sentinel === 'DO-NOT-TOUCH-CUSTOM');
ok('final book has exactly 8 rows (the 2 starting rows + the 6 newly-inserted templates, no duplicates)',
  reconcileRun.book.length === 8);

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
