// Regression coverage for the Rex Rebuttals tab staying automotive-only.
//
// The native/V1 Rex screen shipped a live, unguarded industry picker
// (Mortgage, Real Estate, HVAC, Staffing, Roofing, Fence, Door-to-Door,
// Insurance, Solar, B2B) that any rep could tap into, and that a rep's
// profiles.industry silently auto-selected — directly contradicting the
// LOCKED product decision that V1 is automotive-only and not a
// multi-industry tool (CURRENT_STATE_DECISIONS.md §1, §12). None of that
// content ever went through the anti-fabrication pass Auto's rebuttals did:
// it contained invented market statistics, invented financing terms
// presented as fact, fake scarcity/urgency, fake social proof, and one
// literal unfilled "[X]%" template placeholder.
//
// Source-level guardrails only (this is a content/scope assertion on a
// specific file, the same category of check as scripts/test-production-hardening.mjs)
// — there's no pure function here to behaviorally mirror.
//
//   npm run test:rebuttalsscope    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'app/(tabs)/rex.tsx'), 'utf8');

console.log('\n--- REBUTTAL_INDUSTRIES is Auto-only ---');
ok('REBUTTAL_INDUSTRIES contains only Auto',
  /const REBUTTAL_INDUSTRIES = \['Auto'\];/.test(src));

console.log('\n--- non-auto industries are gone from REBUTTALS, not just unreachable ---');
for (const industry of ['Mortgage', 'Real Estate', 'HVAC', 'Staffing', 'Roofing', 'Fence', 'Door-to-Door', 'Insurance', 'Solar', 'B2B']) {
  ok(`REBUTTALS no longer has a '${industry}' entry`, !src.includes(`'${industry}': [`));
}

console.log('\n--- specific fabricated claims are gone (not just re-labeled) ---');
const bannedClaims = [
  'home prices went up $40K',              // Mortgage: invented market stat
  'FHA gets you in at 3.5%',                 // Mortgage: invented financing terms as fact
  'The buyers who waited in 2021',           // Real Estate: invented market history
  '$40/mo savings',                          // Insurance: invented pricing outcome
  'Your utility just raised rates 8%',       // Solar: invented fact about the customer's utility
  'adds $15K to $20K in home value',         // Solar: invented value claim
  'Our fill rate and retention at 90 days is [X]%', // Staffing: literal broken placeholder
  'zero out-of-pocket for the homeowner',    // Roofing: invented insurance-outcome claim
  'a few neighbors on this street who', // Door-to-Door: fake social proof (ASCII-safe substring)
  'locked in for 30 days',                   // Fence: invented pricing/urgency policy
];
for (const claim of bannedClaims) {
  ok(`banned claim absent: "${claim.slice(0, 40)}..."`, !src.includes(claim));
}

console.log('\n--- Auto rebuttals (the truthfulness-hardened content) are untouched ---');
ok('Auto rebuttals still present', src.includes("'Auto': ["));
ok('Auto rebuttals still carry the truthfulness-hardened copy',
  src.includes('If the car is right, tell me where you hoped to be'));

console.log('\n--- stale non-auto profile data can no longer select a nonexistent tab ---');
ok('the industryToRebuttal cross-industry lookup map is gone', !src.includes('industryToRebuttal'));
ok('only an exact "auto" profile industry can set the Auto tab',
  src.includes("if (prof.industry === 'auto') setRebuttalIndustry('Auto');"));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
