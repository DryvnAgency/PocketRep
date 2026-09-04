// Regression coverage for Issue #160, Lane 2: StalledLeadsAnalysis.tsx's tap
// vs. selection ambiguity. Before this fix, the entire card was one
// Pressable whose onPress toggled selection — so a casual tap "selected" a
// WATCH row with no batch action tied to it (WATCH never appears in
// pickedKill/pickedPushFence), leaving the rep with a highlighted card and
// no next step, and giving selection no affordance of its own.
//
// Source guardrails on the real component, matching this repo's established
// test convention (no RN test renderer in this project — verify the wiring
// directly in source).
//
//   npm run test:stalledleadsux    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const root = path.resolve(new URL('..', import.meta.url).pathname);
const src = fs.readFileSync(path.join(root, 'components/v2/StalledLeadsAnalysis.tsx'), 'utf8');

const cardMatch = src.match(/function Card\([\s\S]*?\n\}\n/);
console.log('\n--- card tap opens the contact, it is no longer an ambiguous selection toggle ---');
ok('Card component is present', !!cardMatch);
const cardBody = cardMatch ? cardMatch[0] : '';
ok("the card's own Pressable onPress is onOpen, not onTogglePick",
  /<Pressable onPress=\{onOpen\}/.test(cardBody) && !/<Pressable onPress=\{onTogglePick\}/.test(src));
ok('the card Pressable is disabled when no onOpen is wired (safe no-op, not silently broken)',
  /<Pressable onPress=\{onOpen\} disabled=\{!onOpen\}/.test(cardBody));
ok('onOpen is accepted as its own, separately-named optional prop', /onOpen\?:\s*\(\)\s*=>\s*void/.test(src));

console.log('\n--- selection has its own explicit affordance (a real checkbox) ---');
ok('a dedicated checkbox Pressable exists inside the card head',
  /accessibilityRole="checkbox"/.test(cardBody));
ok('the checkbox stops propagation so it never also triggers the card-open action',
  /onPress=\{\(e\)\s*=>\s*\{\s*e\.stopPropagation\?\.\(\);\s*onTogglePick\(\);\s*\}\}/.test(cardBody));
ok('the checkbox reflects picked state visibly (fill + checkmark)',
  /picked && \{ backgroundColor: meta\.color, borderColor: meta\.color \}/.test(cardBody) &&
  /\{picked \? <Text style=\{styles\.checkboxMark\}>✓<\/Text> : null\}/.test(cardBody));
ok('the checkbox exposes its state to assistive tech (accessibilityState checked)',
  /accessibilityState=\{\{ checked: picked \}\}/.test(cardBody));

console.log('\n--- WATCH gets a real action instead of a dead-end highlight ---');
ok("the card's open action is unconditional on recommendation type — WATCH rows open the contact just like any other",
  !/recommendation === 'WATCH'[\s\S]{0,40}onOpen/.test(cardBody) && /onPress=\{onOpen\}/.test(cardBody));

console.log('\n--- StalledLeadsAnalysis threads a new, optional onOpenContact prop ---');
ok('onOpenContact is declared as an optional prop on StalledLeadsAnalysis',
  /onOpenContact\?:\s*\(contactId: string\)\s*=>\s*void/.test(src));
ok('onOpenContact is passed to each Card as onOpen, scoped to that row’s contact_id',
  /onOpen=\{onOpenContact \? \(\) => onOpenContact\(r\.contact_id\) : undefined\}/.test(src));
ok('AppShell is not imported or rendered by this lane (only mentioned in doc comments on what remains to be wired)',
  !/import[^;]*AppShell/.test(src) && !/<AppShell/.test(src));

console.log('\n--- KILL stays explicit and destructive, never fired from a casual tap ---');
const killFnMatch = src.match(/const handleKillSelected = async \(\) => \{[\s\S]*?\n  \};/);
ok('handleKillSelected is present', !!killFnMatch);
const killFn = killFnMatch ? killFnMatch[0] : '';
ok('batchKill is only ever called from handleKillSelected, never from the Card', !/batchKill/.test(cardBody) && /batchKill\(/.test(killFn));
ok('handleKillSelected requires a non-empty KILL selection before doing anything',
  /if \(pickedKill\.length === 0 \|\| working\) return;/.test(killFn));
ok('the Kill button in the footer is the only place handleKillSelected is invoked',
  (src.match(/handleKillSelected/g) || []).length === 2); // definition + one onPress wiring
ok('the footer Kill button only renders when at least one KILL row is selected (still an explicit, deliberate action)',
  /pickedKill\.length > 0 \? \(/.test(src));

console.log('\n--- PUSH/FENCE handoff to the existing outreach path is unchanged ---');
ok('handlePushSelected still hands off via onDispatchBlast, not a new send path',
  /onDispatchBlast\(pickedPushFence\)/.test(src));
ok('onDispatchBlast is never called directly from the Card (still selection + explicit footer button gated)',
  !/onDispatchBlast/.test(cardBody));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
