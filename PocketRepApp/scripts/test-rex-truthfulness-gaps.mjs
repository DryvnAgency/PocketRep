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

// Five consumers share rexActions.ts's REX_COPY_RULES via a real import.
// Assert a genuine import exists AND that none of them has grown its own
// local redeclaration — a bare "does REX_COPY_RULES appear in this file"
// check (the previous version of this test) would pass for a local
// redeclaration holding entirely different, possibly stale, rules just as
// happily as for a real import.
const importingConsumers = [
  'lib/v2/blastSequences.ts',
  'lib/v2/nurtureEngine.ts',
  'lib/v2/rexTriad.ts',
  'lib/v2/coachBrain.ts',
  'lib/v2/stalledLeads.ts',
];
for (const rel of importingConsumers) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  ok(`${rel} imports the shared REX_COPY_RULES from rexActions`,
    /import\s*\{[^}]*\bREX_COPY_RULES\b[^}]*\}\s*from\s*['"]\.\/rexActions['"]/.test(src));
  ok(`${rel} does not locally redeclare REX_COPY_RULES`,
    !/\b(?:const|let|var)\s+REX_COPY_RULES\s*=/.test(src));
}

// nurture-scheduler is a separate Deno deployment that cannot import the RN
// module graph (see the file's own comment on this), so it necessarily
// carries its own local copy. This is exactly the gap that slipped through
// before: a bare identifier-name check passed here even though this local
// copy had drifted and was MISSING the inventory/appointment/pricing
// anti-fabrication rules entirely. Assert the actual rule text is present,
// not just the identifier name.
const schedulerSrc = fs.readFileSync(path.join(root, 'supabase/functions/nurture-scheduler/index.ts'), 'utf8');
ok('nurture-scheduler declares its own local REX_COPY_RULES (expected — cross-runtime, cannot import)',
  /\bconst\s+REX_COPY_RULES\s*=/.test(schedulerSrc));
ok('nurture-scheduler REX_COPY_RULES forbids inventing inventory facts',
  schedulerSrc.includes('Never invent inventory facts'));
ok('nurture-scheduler REX_COPY_RULES covers stock/shipment/demand claims specifically',
  schedulerSrc.includes('low/limited stock, a shipment, or demand for a model'));
ok('nurture-scheduler REX_COPY_RULES explicitly forbids invented pricing/incentives/financing',
  schedulerSrc.includes('Never invent or imply pricing, payments, incentives, rebates, or financing terms'));
ok('nurture-scheduler REX_COPY_RULES states there is no appointment calendar/scheduling record',
  schedulerSrc.includes('There is no appointment calendar or scheduling record in your context'));
ok('nurture-scheduler REX_COPY_RULES forbids upgrading a tentative appointment mention',
  schedulerSrc.includes('Never upgrade a tentative mention into a confirmed one'));
ok('nurture-scheduler frames CRM contact data as untrusted before interpolating it',
  /function\s+frameUntrusted/.test(schedulerSrc) && schedulerSrc.includes('UNTRUSTED'));
ok('nurture-scheduler clamps last_contact_summary before it enters a prompt',
  /clampNote\(\s*c\.last_contact_summary\s*\)/.test(schedulerSrc));
ok('nurture-scheduler no longer offers unsupported pricing/inventory as blast hooks',
  !/Hook into ONE of:[^\n]*\b(pricing|inventory)\b/i.test(schedulerSrc));

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
