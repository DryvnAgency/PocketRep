// Regression coverage for three related Rex truthfulness/isolation gaps found
// during a hostile launch-QA pass:
//
// 1. Appointment awareness with no data source. rexActions.ts's shared
//    REX_COPY_RULES told the model to "check appointment state" and act
//    differently when "a confirmed upcoming appointment exists" — but no
//    contact-context serializer (bookContext.ts, repContext.ts,
//    useContacts.ts) ever populates a real appointment field. The model had
//    to either always take the "no appointment" branch, or infer/upgrade a
//    vague mention ("said they might stop by") into a false "confirmed"
//    state. REX_COPY_RULES is shared by six consumers — nurture-scheduler
//    (the actual SMS-sending edge function), blastSequences.ts,
//    nurtureEngine.ts, rexTriad.ts, coachBrain.ts, and stalledLeads.ts — so
//    this one gap reached every customer-facing generator in the app.
//
// 2. Inventory fabrication. stalledLeads.ts's opener prompt explicitly
//    listed "inventory" as a reason to reference in a re-engagement text,
//    with nothing in REX_COPY_RULES forbidding an invented scarcity/
//    availability claim (only specific numbers were covered).
//
// 3. Cross-customer context bleed. The native V1 Rex screen (app/(tabs)/rex.tsx)
//    keeps one continuous chat thread across contact switches (intentional —
//    repContext.ts's cross-contact recall feature depends on it), but the
//    system prompt never told the model that "Active customer context" is
//    scoped to the CURRENT turn only, so a fact from an earlier turn about a
//    different customer could get blended into advice about whoever is
//    active now.
//
// Source-level guardrails only (this is a content/scope assertion on the
// real system prompts, the same category of check as
// test-production-hardening.mjs) — there's no pure function to mirror.
//
//   npm run test:rextruthfulness    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const rexActionsSrc = fs.readFileSync(path.join(root, 'lib/v2/rexActions.ts'), 'utf8');
const rexTsxSrc = fs.readFileSync(path.join(root, 'app/(tabs)/rex.tsx'), 'utf8');

console.log('\n--- appointment awareness is honest about having no data source ---');
ok('REX_COPY_RULES states there is no appointment calendar/scheduling record',
  rexActionsSrc.includes('There is no appointment calendar or scheduling record in your context'));
ok('a vague/tentative mention is explicitly excluded from "confirmed"',
  rexActionsSrc.includes('is NOT a confirmed appointment'));
ok('the model is told never to upgrade a tentative mention',
  rexActionsSrc.includes('Never upgrade a tentative mention into a confirmed one'));

console.log('\n--- REX_COPY_RULES propagates the fix to every consumer ---');
const consumers = [
  'supabase/functions/nurture-scheduler/index.ts',
  'lib/v2/blastSequences.ts',
  'lib/v2/nurtureEngine.ts',
  'lib/v2/rexTriad.ts',
  'lib/v2/coachBrain.ts',
  'lib/v2/stalledLeads.ts',
];
for (const rel of consumers) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  ok(`${rel} imports the shared REX_COPY_RULES`, /REX_COPY_RULES/.test(src));
}

console.log('\n--- inventory fabrication is explicitly forbidden ---');
ok('REX_COPY_RULES forbids inventing inventory facts',
  rexActionsSrc.includes('Never invent inventory facts'));
ok('the inventory rule covers stock/shipment/demand claims specifically',
  rexActionsSrc.includes('low/limited stock, a shipment, or demand for a model'));

console.log('\n--- cross-customer context boundary (native V1) ---');
ok('REX_SYSTEM states Active customer context is scoped to the current turn',
  rexTsxSrc.includes('Active customer context above is scoped to right now'));
ok('REX_SYSTEM forbids blending a previous customer\'s facts into the current one',
  rexTsxSrc.includes("never blend a previous customer's specific facts into advice about whoever is active now"));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
