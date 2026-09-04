// Regression coverage for the Rex continuity/navigation audit.
//
// This audit found one real, precisely-diagnosed gap (RexCoach.tsx's
// activeContactIdRef is unconditionally reset to null on every open and is
// only ever populated by the rep typing a contact's name — there is no
// automatic hand-off from AppShell's already-tracked `selected` contact, even
// though the codebase's own dormant voice path (lib/v2/rexActions.ts's
// rexInterpret, via getRexMemory(opts.selectedContactId) + buildScreenContext)
// already does exactly this). The fix is documented in the PR body rather
// than applied here: it requires editing RexCoach.tsx and AppShell.tsx,
// both under substantial, active, unmerged rewrite in PR #161 tonight
// (RexCoach.tsx +212 lines, AppShell.tsx +284 lines) — including, per that
// PR's own description, "contact-scoped Rex coaching saved as game-plan
// history," which plausibly touches this exact ref. Editing either file
// tonight risks an avoidable merge collision on the precise surface the
// assignment said to route around.
//
// What DID ship from this audit is verification, encoded here as regression
// guards so these already-correct properties don't silently regress:
//   - durable, cross-device Rex conversation history (coachThread.ts / the
//     local day-log RexCoach reseeds from on every open) is still present;
//   - contact-scoped memory boundaries (rexMemory.ts's getRexMemory) still
//     isolate one customer's history from another and are never blended
//     into a rep-wide summary when a contact is specified;
//   - no background-mic/always-listening claims in the live text-only Rex
//     surface;
//   - no RexLens/OpenRex reachable from the current Rex UI surface (word-
//     boundary correct — the naive substring "OpenRex" also matches the
//     legitimate `onOpenRexActivity` prop name, which is NOT RexLens/OpenRex
//     contamination; a prior sweep already found and fixed real
//     contamination this session, so this guards that it stays fixed).
//
//   node scripts/test-rex-continuity-audit.mjs    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const rexCoach = read('components/v2/RexCoach.tsx');
const heyRexOrb = read('components/v2/HeyRexOrb.tsx');
const rexMemory = read('lib/v2/rexMemory.ts');
const coachThread = read('lib/v2/coachThread.ts');
const appShell = read('components/v2/AppShell.tsx');

console.log('\n--- PRESERVED: durable, cross-device Rex conversation history ---');
ok('coachThread.ts still exposes loadTodayServerThread for cross-device restore',
  /export async function loadTodayServerThread/.test(coachThread));
ok('RexCoach still reseeds from the persistent local day-log on every open (never starts blank while a real thread exists)',
  /getCarrySummary\(\)/.test(rexCoach) && /getTodayLog\(\)/.test(rexCoach));
ok('RexCoach still guards the async server-thread restore from clobbering an in-progress conversation',
  /interactedRef/.test(rexCoach) && /rows\.length <= today\.length/.test(rexCoach));
ok('every pushed turn is still persisted (not just held in memory) so a reopen can reconstruct it',
  /appendCoachEntry\(\{ role: 'user'/.test(rexCoach) && /appendCoachEntry\(\{ role: 'rex'/.test(rexCoach));

console.log('\n--- PRESERVED: contact-scoped memory boundaries (no cross-customer leakage) ---');
ok('getRexMemory branches on contactId before falling back to a rep-wide summary',
  /export async function getRexMemory\(contactId\?/.test(rexMemory));
ok('a per-contact request is documented and coded to never blend in the rep-wide summary',
  /Never inject it here/.test(rexMemory) &&
  /\.eq\('contact_id', contactId\)/.test(rexMemory));

console.log('\n--- PRESERVED: no background-mic / always-listening claims in the live text-only Rex surface ---');
ok('RexCoach (the only thing the orb opens in V1) makes no listening/always-on/background-audio claims',
  !/\blistening\b/i.test(rexCoach) && !/always.?on/i.test(rexCoach) && !/background.?(mic|audio)/i.test(rexCoach));
// HeyRexOrb's 'listening' is a dormant OrbState enum value for a future voice
// feature (an animation + accessibility-label branch), not copy claiming
// active listening today — the property that actually matters is that
// AppShell (the only place that drives the orb in production) never sets it
// to anything but the static 'idle' value, so the listening branch is
// unreachable in the live V1 product.
ok("HeyRexOrb's listening state exists only as an inert enum member, correctly never driven live",
  /'idle' \| 'listening' \| 'processing' \| 'saved'/.test(heyRexOrb));
ok('AppShell drives the orb with a static, non-listening state (V1 has no listener to ever flip it)',
  /orbState="idle"/.test(appShell) && !/setOrbState/.test(appShell));

console.log('\n--- PRESERVED: no RexLens / OpenRex reachable from the current Rex UI surface ---');
// Word-boundary correct: a naive substring test also flags the legitimate
// onOpenRexActivity prop (opens RexActivityViewer, a real PocketRep feature,
// nothing to do with the disregarded RexLens/OpenRex products).
const rexLensPattern = /\bRexLens\b/i;
const openRexPattern = /\bOpenRex\b/i;
for (const [name, src] of [['RexCoach.tsx', rexCoach], ['HeyRexOrb.tsx', heyRexOrb]]) {
  ok(`${name} has no RexLens reference`, !rexLensPattern.test(src));
  ok(`${name} has no standalone OpenRex reference (onOpenRexActivity is unrelated and expected)`, !openRexPattern.test(src));
}
ok('the word-boundary regex correctly ignores the legitimate onOpenRexActivity prop name',
  !openRexPattern.test('onOpenRexActivity') && /OpenRex/.test('onOpenRexActivity'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
