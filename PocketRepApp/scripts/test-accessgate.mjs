// Unit tests for the access gate decision function (lib/v2/accessGate.ts).
// Mirrors decideAccess logic without importing React or Supabase.
//
//   npm run test:accessgate    (from PocketRepApp/)

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

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

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${26} checks)`);
process.exit(failures ? 1 : 0);
