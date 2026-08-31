// Unit tests for the access gate (lib/v2/accessGate.ts).
//
// Part 1 mirrors decideAccess logic without importing React or Supabase.
// Part 2 covers the auth/access race: useAccessGate used to run once on mount
// with `[]` deps, so a logged-out mount latched `locked / invalid_account` and
// a subsequently-signed-in valid rep hit LockoutScreen ("Account not found")
// until a focus change or the 60s interval happened to re-run it. A hook's
// effect gating can't be exercised in a plain Node runner, so that part pairs a
// behavioral mirror with source-level guardrails against the real files — the
// same approach scripts/test-production-hardening.mjs already uses.
//
//   npm run test:accessgate    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
// Counted rather than hardcoded — the previous literal had drifted out of sync
// with the real number of assertions.
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- mirrored logic from accessGate.ts ----
function decideAccess(input) {
  const now = input.now ?? new Date();
  const entitlement = (input.entitlementStatus ?? '').toLowerCase();
  const status = (input.subscriptionStatus ?? '').toLowerCase();

  if (entitlement === 'pending') {
    const until = input.pendingUntil ? new Date(input.pendingUntil).getTime() : NaN;
    if (Number.isFinite(until) && until > now.getTime()) return { status: 'pending', until: input.pendingUntil };
    return { status: 'locked', reason: 'entitlement_unverified' };
  }

  if (entitlement === 'locked') return { status: 'locked', reason: 'entitlement_unverified' };
  if (status === 'active' || entitlement === 'active') return { status: 'allowed' };

  if (status === 'trialing' || entitlement === 'trialing') {
    if (!input.trialEndsAt) return { status: 'allowed' };
    const ends = new Date(input.trialEndsAt).getTime();
    return Number.isFinite(ends) && ends > now.getTime()
      ? { status: 'allowed' }
      : { status: 'locked', reason: 'trial_expired' };
  }

  if (status === 'canceled' || status === 'cancelled') return { status: 'locked', reason: 'subscription_canceled' };
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') return { status: 'locked', reason: 'payment_failed' };

  if (input.trialEndsAt) {
    const ends = new Date(input.trialEndsAt).getTime();
    if (Number.isFinite(ends) && ends > now.getTime()) return { status: 'allowed' };
    return { status: 'locked', reason: 'trial_expired' };
  }

  return { status: 'locked', reason: 'no_subscription' };
}

const NOW = new Date('2026-08-20T12:00:00Z');
const FUTURE = '2026-09-20T12:00:00Z';
const PAST = '2026-07-01T12:00:00Z';

// ---- active subscription ----
ok('active sub → allowed', decideAccess({ subscriptionStatus: 'active', now: NOW }).status === 'allowed');
ok('ACTIVE (case insensitive) → allowed', decideAccess({ subscriptionStatus: 'ACTIVE', now: NOW }).status === 'allowed');

// ---- active entitlement overrides ----
ok('active entitlement → allowed', decideAccess({ entitlementStatus: 'active', now: NOW }).status === 'allowed');
ok('active entitlement, no sub → allowed', decideAccess({ entitlementStatus: 'active', subscriptionStatus: '', now: NOW }).status === 'allowed');

// ---- trialing ----
ok('trialing, future end → allowed', decideAccess({ subscriptionStatus: 'trialing', trialEndsAt: FUTURE, now: NOW }).status === 'allowed');
ok('trialing, past end → locked', decideAccess({ subscriptionStatus: 'trialing', trialEndsAt: PAST, now: NOW }).status === 'locked');
ok('trialing, past end → trial_expired', decideAccess({ subscriptionStatus: 'trialing', trialEndsAt: PAST, now: NOW }).reason === 'trial_expired');
ok('trialing, no end → allowed', decideAccess({ subscriptionStatus: 'trialing', now: NOW }).status === 'allowed');

// ---- canceled ----
ok('canceled → locked', decideAccess({ subscriptionStatus: 'canceled', now: NOW }).status === 'locked');
ok('canceled → subscription_canceled', decideAccess({ subscriptionStatus: 'canceled', now: NOW }).reason === 'subscription_canceled');
ok('cancelled (UK spelling) → locked', decideAccess({ subscriptionStatus: 'cancelled', now: NOW }).status === 'locked');

// ---- past_due / unpaid ----
ok('past_due → payment_failed', decideAccess({ subscriptionStatus: 'past_due', now: NOW }).reason === 'payment_failed');
ok('unpaid → payment_failed', decideAccess({ subscriptionStatus: 'unpaid', now: NOW }).reason === 'payment_failed');
ok('incomplete_expired → payment_failed', decideAccess({ subscriptionStatus: 'incomplete_expired', now: NOW }).reason === 'payment_failed');

// ---- no subscription at all ----
ok('empty → no_subscription', decideAccess({ now: NOW }).reason === 'no_subscription');
ok('null → no_subscription', decideAccess({ subscriptionStatus: null, now: NOW }).reason === 'no_subscription');

// ---- entitlement pending (grace period) ----
ok('pending + future grace → pending', decideAccess({ entitlementStatus: 'pending', pendingUntil: FUTURE, now: NOW }).status === 'pending');
ok('pending + past grace → locked', decideAccess({ entitlementStatus: 'pending', pendingUntil: PAST, now: NOW }).status === 'locked');
ok('pending + past grace → entitlement_unverified', decideAccess({ entitlementStatus: 'pending', pendingUntil: PAST, now: NOW }).reason === 'entitlement_unverified');
ok('pending + no grace → locked', decideAccess({ entitlementStatus: 'pending', now: NOW }).status === 'locked');

// ---- entitlement locked ----
ok('entitlement locked → locked', decideAccess({ entitlementStatus: 'locked', now: NOW }).status === 'locked');
ok('entitlement locked → entitlement_unverified', decideAccess({ entitlementStatus: 'locked', now: NOW }).reason === 'entitlement_unverified');

// ---- fail-closed: unknown status → locked ----
ok('unknown sub status → locked', decideAccess({ subscriptionStatus: 'whatever', now: NOW }).status === 'locked');
ok('unknown sub status → no_subscription', decideAccess({ subscriptionStatus: 'whatever', now: NOW }).reason === 'no_subscription');

// ---- trial fallback (no sub status but has trial) ----
ok('no sub + future trial → allowed', decideAccess({ trialEndsAt: FUTURE, now: NOW }).status === 'allowed');
ok('no sub + past trial → trial_expired', decideAccess({ trialEndsAt: PAST, now: NOW }).reason === 'trial_expired');

// ===========================================================================
// Part 2 — auth/access race (useAccessGate enable-gating)
// ===========================================================================

// Behavioral mirror of the hook's effect body. Counts the two network reads so
// we can prove the disabled path performs neither.
function createGate({ user = null, profile = null, profileError = false, now = NOW } = {}) {
  const calls = { getUser: 0, profileRead: 0 };
  let state = { status: 'loading' };
  const runEffect = (enabled) => {
    if (!enabled) {
      state = state.status === 'loading' ? state : { status: 'loading' };
      return;
    }
    calls.getUser++;
    if (!user) { state = { status: 'locked', reason: 'invalid_account' }; return; }
    calls.profileRead++;
    if (profileError || !profile) { state = { status: 'locked', reason: 'no_subscription' }; return; }
    state = decideAccess({ ...profile, now });
  };
  return { runEffect, calls, get state() { return state; } };
}

console.log('\n--- auth/access race: logged-out mount must not poison state ---');
const gOut = createGate({ user: null });
gOut.runEffect(false); // mounts before auth resolves
ok('disabled mount stays loading', gOut.state.status === 'loading');
ok('disabled mount does not call getUser', gOut.calls.getUser === 0);
ok('disabled mount does not read billing profile', gOut.calls.profileRead === 0);
ok('disabled mount never produces a locked state', gOut.state.status !== 'locked');

console.log('\n--- auth/access race: successful sign-in rechecks immediately ---');
const gTrial = createGate({ user: { id: 'u1' }, profile: { subscriptionStatus: 'trialing', trialEndsAt: FUTURE } });
gTrial.runEffect(false); // logged-out mount
ok('still loading before auth is ready', gTrial.state.status === 'loading');
gTrial.runEffect(true);  // SIGNED_IN -> authReady flips true
ok('sign-in triggers exactly one entitlement check', gTrial.calls.getUser === 1);
ok('valid trialing account is ALLOWED after sign-in (the repro)', gTrial.state.status === 'allowed');
ok('valid trialing account is not locked after sign-in', gTrial.state.status !== 'locked');

const gActive = createGate({ user: { id: 'u2' }, profile: { subscriptionStatus: 'active' } });
gActive.runEffect(false);
gActive.runEffect(true);
ok('valid active account is ALLOWED after sign-in', gActive.state.status === 'allowed');

console.log('\n--- auth/access race: real lock reasons still lock ---');
const gNoUser = createGate({ user: null });
gNoUser.runEffect(true); // enabled but session genuinely gone (e.g. expired)
ok('enabled + no user still locks', gNoUser.state.status === 'locked');
ok('enabled + no user still reports invalid_account', gNoUser.state.reason === 'invalid_account');

const gNoProfile = createGate({ user: { id: 'u3' }, profile: null });
gNoProfile.runEffect(true);
ok('enabled + missing profile row still reports no_subscription', gNoProfile.state.reason === 'no_subscription');

const gCanceled = createGate({ user: { id: 'u4' }, profile: { subscriptionStatus: 'canceled' } });
gCanceled.runEffect(true);
ok('enabled + canceled still reports subscription_canceled', gCanceled.state.reason === 'subscription_canceled');

const gExpired = createGate({ user: { id: 'u5' }, profile: { subscriptionStatus: 'trialing', trialEndsAt: PAST } });
gExpired.runEffect(true);
ok('enabled + expired trial still reports trial_expired', gExpired.state.reason === 'trial_expired');

console.log('\n--- auth/access race: sign-out clears entitlement state ---');
const gSignOut = createGate({ user: { id: 'u6' }, profile: { subscriptionStatus: 'active' } });
gSignOut.runEffect(true);
ok('signed-in active account allowed', gSignOut.state.status === 'allowed');
gSignOut.runEffect(false); // SIGNED_OUT -> authReady false
ok('sign-out resets to loading (no stale allowed for the next account)', gSignOut.state.status === 'loading');

console.log('\n--- auth/access race: source guardrails on the real files ---');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const gateSrc = fs.readFileSync(path.join(root, 'lib/v2/accessGate.ts'), 'utf8');
const shellSrc = fs.readFileSync(path.join(root, 'components/v2/AppShell.tsx'), 'utf8');

ok('accessGate exposes the enabled flag with a safe default',
  gateSrc.includes('export function useAccessGate(enabled = true)'));
ok('accessGate short-circuits when disabled',
  gateSrc.includes('if (!enabled) {'));
ok('accessGate effect depends on enabled (not a bare [])',
  gateSrc.includes('}, [enabled]);') && !gateSrc.includes('}, []);'));
ok('disabled branch returns before any getUser call',
  gateSrc.indexOf('if (!enabled) {') < gateSrc.indexOf('supabase.auth.getUser()'));
ok('AppShell gates the access check on authReady',
  shellSrc.includes('useAccessGate(authReady)'));
ok('visibility/foreground recheck preserved',
  gateSrc.includes('visibilitychange') && gateSrc.includes('AppState.addEventListener'));
ok('60s interval fallback preserved',
  gateSrc.includes('RECHECK_INTERVAL_MS') && gateSrc.includes('setInterval(safeLoad'));
ok('decideAccess still drives the resolved state',
  gateSrc.includes('setState(decideAccess({'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
