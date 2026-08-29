#!/usr/bin/env node
// Mirror test for Smart Blast message uniqueness enforcement.
// Pure-Node, no I/O — exercises enforceUniqueness logic directly.

import { strict as assert } from 'node:assert';

// ── Inline the logic (mirror test — no bundler, no TS) ───────────────────────

function normalizeBody(msg) {
  return msg.toLowerCase().replace(/\s+/g, ' ').trim();
}

function enforceUniqueness(steps) {
  const violations = [];
  if (steps.length <= 1) return { passed: true, violations };

  // 1. Exact-duplicate check
  const bodyMap = new Map();
  for (const s of steps) {
    const norm = normalizeBody(s.message);
    const existing = bodyMap.get(norm);
    if (existing) existing.push(s.contact_name);
    else bodyMap.set(norm, [s.contact_name]);
  }
  for (const [, names] of bodyMap) {
    if (names.length > 1) {
      violations.push(`Exact duplicate message shared by: ${names.join(', ')}`);
    }
  }

  // 2. First-name-only substitution check
  const strippedBodies = steps.map(s => {
    const firstName = s.contact_name.split(/\s+/)[0];
    if (!firstName) return { name: s.contact_name, stripped: normalizeBody(s.message) };
    const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    return { name: s.contact_name, stripped: normalizeBody(s.message.replace(re, '')) };
  });
  const strippedMap = new Map();
  for (const { name, stripped } of strippedBodies) {
    const existing = strippedMap.get(stripped);
    if (existing) existing.push(name);
    else strippedMap.set(stripped, [name]);
  }
  for (const [, names] of strippedMap) {
    if (names.length > 1) {
      const alreadyReported = violations.some(v => v.startsWith('Exact duplicate'));
      if (!alreadyReported) {
        violations.push(`Template substitution (only first name differs): ${names.join(', ')}`);
      }
    }
  }

  // 3. Opener similarity check
  const openerRe = /^(?:hey|hola|qu[eé]\s+(?:tal|onda))\s+\S+[,!]?\s*/i;
  const openers = steps.map(s => {
    const afterGreeting = s.message.replace(openerRe, '').toLowerCase().trim();
    return afterGreeting.slice(0, 40);
  });
  const openerCounts = new Map();
  for (const o of openers) {
    openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);
  }
  for (const [opener, count] of openerCounts) {
    if (opener && count / steps.length > 0.8 && count > 1) {
      violations.push(`${count}/${steps.length} messages share the same opener structure`);
      break;
    }
  }

  return { passed: violations.length === 0, violations };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(overrides = {}) {
  return {
    contact_id: 'c1',
    contact_name: 'John Smith',
    language: 'en',
    message: 'hey john, just saw the 2025 camry landed on our lot today',
    game_plan: 'test',
    hook_used: 'inventory',
    char_count: 55,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n🎯 Smart Blast Uniqueness Enforcement\n');

test('empty array passes', () => {
  const r = enforceUniqueness([]);
  assert.equal(r.passed, true);
  assert.equal(r.violations.length, 0);
});

test('single message always passes', () => {
  const r = enforceUniqueness([makeStep()]);
  assert.equal(r.passed, true);
  assert.equal(r.violations.length, 0);
});

test('genuinely unique batch passes', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'hey alice, the 2025 camry just landed — your lease is up next month, perfect timing', hook_used: 'calendar_event' }),
    makeStep({ contact_name: 'Bob', message: 'hey bob, we got that tundra you were asking about in the exact color you wanted', hook_used: 'vehicle_interest' }),
    makeStep({ contact_name: 'Carlos', message: 'hola carlos, qué onda — tengo una oferta especial de fin de año que te va a gustar', hook_used: 'pricing' }),
  ]);
  assert.equal(r.passed, true);
  assert.equal(r.violations.length, 0);
});

test('detects exact duplicate messages', () => {
  const msg = 'hey there, we have a great deal for you today on the 2025 camry';
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: msg }),
    makeStep({ contact_name: 'Bob', message: msg }),
  ]);
  assert.equal(r.passed, false);
  assert.ok(r.violations.some(v => v.includes('Exact duplicate')));
});

test('detects exact duplicates with whitespace differences', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'hey alice,  great deal   for you' }),
    makeStep({ contact_name: 'Bob', message: 'hey alice, great deal for you' }),
  ]);
  assert.equal(r.passed, false);
  assert.ok(r.violations.some(v => v.includes('Exact duplicate')));
});

test('detects first-name-only template substitution', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'hey Alice, we have the 2025 camry on special this week, let me know' }),
    makeStep({ contact_name: 'Bob', message: 'hey Bob, we have the 2025 camry on special this week, let me know' }),
  ]);
  assert.equal(r.passed, false);
  assert.ok(r.violations.some(v => v.includes('Template substitution') || v.includes('Exact duplicate')));
});

test('allows a reused broad hook when the actual messages differ', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'hey alice, your lease wraps up soon', hook_used: 'calendar_event' }),
    makeStep({ contact_name: 'Bob', message: 'hey bob, saw that tundra you liked is here', hook_used: 'calendar_event' }),
  ]);
  assert.equal(r.passed, true);
  assert.equal(r.violations.length, 0);
});

test('detects opener similarity when >80% share same opener', () => {
  // 5 messages, 5 have the same opener after the greeting
  const sharedBody = 'i wanted to let you know about a deal we got going on right now for the';
  const r = enforceUniqueness([
    makeStep({ contact_name: 'A', message: `hey A, ${sharedBody} camry`, hook_used: 'pricing' }),
    makeStep({ contact_name: 'B', message: `hey B, ${sharedBody} corolla`, hook_used: 'inventory' }),
    makeStep({ contact_name: 'C', message: `hey C, ${sharedBody} tacoma`, hook_used: 'vehicle_interest' }),
    makeStep({ contact_name: 'D', message: `hey D, ${sharedBody} tundra`, hook_used: 'rapport' }),
    makeStep({ contact_name: 'E', message: `hey E, ${sharedBody} rav4`, hook_used: 'calendar_event' }),
  ]);
  assert.equal(r.passed, false);
  assert.ok(r.violations.some(v => v.includes('opener structure')));
});

test('opener similarity passes when <80% share same opener', () => {
  // 5 messages, only 2 share the same opener — 40% < 80%
  const r = enforceUniqueness([
    makeStep({ contact_name: 'A', message: 'hey A, your lease is up next month so i wanted to reach out', hook_used: 'calendar_event' }),
    makeStep({ contact_name: 'B', message: 'hey B, your lease is up next month so i wanted to reach out about the corolla', hook_used: 'vehicle_interest' }),
    makeStep({ contact_name: 'C', message: 'hey C, that tundra you asked about just hit the lot today', hook_used: 'inventory' }),
    makeStep({ contact_name: 'D', message: 'hey D, been thinking about our conversation last week', hook_used: 'rapport' }),
    makeStep({ contact_name: 'E', message: 'hey E, we got a memorial day special running right now', hook_used: 'pricing' }),
  ]);
  assert.equal(r.passed, true);
  assert.equal(r.violations.length, 0);
});

test('Spanish messages work correctly', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Carlos', message: 'hola Carlos, tengo una oferta especial para ti', hook_used: 'pricing', language: 'es' }),
    makeStep({ contact_name: 'María', message: 'qué tal María, acaba de llegar el tacoma que buscabas', hook_used: 'inventory', language: 'es' }),
  ]);
  assert.equal(r.passed, true);
});

test('multiple violations reported together', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'hey Alice, wanted to reach out about this deal', hook_used: 'pricing' }),
    makeStep({ contact_name: 'Bob', message: 'hey Bob, wanted to reach out about this deal', hook_used: 'pricing' }),
  ]);
  assert.equal(r.passed, false);
  assert.ok(r.violations.some(v => v.includes('Template substitution')));
});

test('case differences in message bodies still caught', () => {
  const r = enforceUniqueness([
    makeStep({ contact_name: 'Alice', message: 'HEY ALICE great deal for you today' }),
    makeStep({ contact_name: 'Bob', message: 'hey alice great deal for you today' }),
  ]);
  assert.equal(r.passed, false);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
