// Regression coverage for lib/v2/gamePlan.ts's rep identity.
//
// Game Plan drafts a script the rep then texts/emails directly to a REAL
// customer (ContactDetail.tsx wires the result straight into openText/openEmail).
// The prompt used to hardcode "Coach Jake (senior BMW advisor)" and sign every
// script "Jake" regardless of who was actually signed in — every customer of
// every rep got a script written for, and signed by, a fictional person. This
// mirrors the fix's pure logic (no live model call, no test runner — same
// approach as scripts/test-followup-drafts.mjs) and pairs it with source-level
// guardrails against the real file, the same two-part pattern used in
// scripts/test-accessgate.mjs, since a hand-written mirror alone can't catch a
// regression back to a hardcoded literal in the real file.
//
//   npm run test:gameplan    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- mirrored from gamePlan.ts ----
const DEFAULT_REP_NAME = 'Eddie';
const DEFAULT_DEALERSHIP = 'Nissan of Omaha';
const UNNAMED_REP_TOKEN = 'the rep';

function resolveIdentity(identity) {
  const rawName = (identity.name ?? '').trim();
  const repName = rawName || DEFAULT_REP_NAME;
  const dealership = (identity.dealership ?? '').trim() || DEFAULT_DEALERSHIP;
  const signable = repName !== UNNAMED_REP_TOKEN;
  return { repName, dealership, signable };
}

function buildPrompt(notes, repName, dealership, signable) {
  const signOff = signable
    ? `End with "${repName}" only on text/email.`
    : `Do not sign the script with any name — end on the message itself.`;
  return `You are Rex, the AI sales coach inside PocketRep. Coach ${repName}, a ${dealership} rep, on their next move with this customer.
${repName}'s notes on this customer:
${notes || '(no notes yet)'}
SCRIPT:
<... ${signOff}>`;
}

console.log('\n--- identity resolution ---');
const namedRep = resolveIdentity({ name: 'Sarah', dealership: 'Toyota of Plano' });
ok('a real name is used as-is', namedRep.repName === 'Sarah');
ok('a real dealership is used as-is', namedRep.dealership === 'Toyota of Plano');
ok('a named rep is signable', namedRep.signable === true);

const unnamedRealRep = resolveIdentity({ name: 'the rep' });
ok('the internal unnamed-rep token is kept as the coaching-address name', unnamedRealRep.repName === 'the rep');
ok('the internal unnamed-rep token is NOT signable (never printed to a customer)', unnamedRealRep.signable === false);

const noIdentity = resolveIdentity({});
ok('no identity falls back to the shared demo default name', noIdentity.repName === DEFAULT_REP_NAME);
ok('no identity falls back to the shared demo default dealership', noIdentity.dealership === DEFAULT_DEALERSHIP);
ok('the demo default is signable', noIdentity.signable === true);

console.log('\n--- prompt content ---');
const p1 = buildPrompt('likes the Civic', 'Sarah', 'Toyota of Plano', true);
ok('prompt addresses the real rep by name', p1.includes('Coach Sarah, a Toyota of Plano rep'));
ok('prompt attributes notes to the real rep', p1.includes("Sarah's notes on this customer"));
ok('prompt signs the script with the real rep\'s name', p1.includes('End with "Sarah" only on text/email.'));
ok('prompt never mentions the old hardcoded persona', !p1.includes('Jake') && !p1.includes('BMW'));

const p2 = buildPrompt('', 'the rep', 'Nissan of Omaha', false);
ok('unsignable prompt tells Rex not to sign a name', p2.includes('Do not sign the script with any name'));
ok('unsignable prompt never instructs signing with the internal placeholder', !p2.includes('End with "the rep"'));

console.log('\n--- source guardrails on the real file ---');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'lib/v2/gamePlan.ts'), 'utf8');

ok('gamePlan.ts no longer hardcodes the "Jake" persona', !src.includes('Jake'));
ok('gamePlan.ts no longer hardcodes "senior BMW advisor"', !src.includes('senior BMW advisor'));
ok('gamePlan.ts resolves the real signed-in rep\'s identity', src.includes('loadRepIdentity'));
ok('gamePlan.ts refuses to sign with the internal unnamed-rep token', src.includes("repName !== UNNAMED_REP_TOKEN"));
ok('gamePlan.ts attributes notes to the resolved rep, not a fixed name', src.includes("${repName}'s notes on this customer"));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
