/**
 * PocketRep — Referral system unit tests.
 *
 * Tests the referral code format, checkout attribution lookup,
 * self-referral blocking, and reward deduplication logic.
 */

let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}`); }
}

// ── Referral code format ────────────────────────────────────────────────

// PR- prefix + 10 hex chars (uppercase)
const codeRegex = /^PR-[A-F0-9]{10}$/;

function generateCode(uuid) {
  return 'PR-' + uuid.replace(/-/g, '').slice(0, 10).toUpperCase();
}

ok(codeRegex.test('PR-1A2B3C4D5E'), 'valid code passes regex');
ok(!codeRegex.test('PR-1a2b3c4d5e'), 'lowercase fails regex');
ok(!codeRegex.test('AB-1A2B3C4D5E'), 'wrong prefix fails');
ok(!codeRegex.test('PR-1A2B3C4D'), 'too short fails');
ok(!codeRegex.test('PR-1A2B3C4D5E6'), 'too long fails');
ok(!codeRegex.test(''), 'empty fails');

// Deterministic from UUID
const uuid1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const uuid2 = 'f9e8d7c6-b5a4-3210-fedc-ba9876543210';
ok(generateCode(uuid1) === generateCode(uuid1), 'same UUID → same code');
ok(generateCode(uuid1) !== generateCode(uuid2), 'different UUIDs → different codes');
ok(codeRegex.test(generateCode(uuid1)), 'generated code matches format');

// ── Self-referral blocking ──────────────────────────────────────────────

function shouldAttributeReferral({ referrerUserId, referredUserId, existingProfile }) {
  // Mirrors checkout-account logic
  if (!referrerUserId) return false;
  if (referrerUserId === referredUserId) return false; // self-referral
  if (existingProfile) return false; // already has account
  return true;
}

ok(!shouldAttributeReferral({ referrerUserId: 'u1', referredUserId: 'u1', existingProfile: null }),
  'self-referral blocked');
ok(shouldAttributeReferral({ referrerUserId: 'u1', referredUserId: 'u2', existingProfile: null }),
  'valid referral allowed');
ok(shouldAttributeReferral({ referrerUserId: 'u1', referredUserId: null, existingProfile: null }),
  'null referred user still allowed (new signup)');
ok(!shouldAttributeReferral({ referrerUserId: null, referredUserId: 'u2', existingProfile: null }),
  'null referrer blocked');
ok(!shouldAttributeReferral({ referrerUserId: 'u1', referredUserId: 'u2', existingProfile: { id: 'u2' } }),
  'existing profile blocks re-attribution');

// ── Checkout session referral code parsing ──────────────────────────────

function parseReferralCode(clientRefId) {
  return typeof clientRefId === 'string' && /^PR-[A-Z0-9]{10}$/.test(clientRefId)
    ? clientRefId
    : null;
}

ok(parseReferralCode('PR-1A2B3C4D5E') === 'PR-1A2B3C4D5E', 'valid code parsed');
ok(parseReferralCode('INVALID') === null, 'invalid string → null');
ok(parseReferralCode(null) === null, 'null → null');
ok(parseReferralCode(undefined) === null, 'undefined → null');
ok(parseReferralCode(42) === null, 'number → null');
ok(parseReferralCode('') === null, 'empty → null');
ok(parseReferralCode('pr-1a2b3c4d5e') === null, 'lowercase → null');

// ── Reward deduplication ────────────────────────────────────────────────

function shouldReward(referral) {
  if (!referral?.id) return false;
  if (!referral.referrer_user_id) return false;
  if (!referral.referred_user_id) return false;
  if (referral.referrer_user_id === referral.referred_user_id) return false;
  if (referral.status === 'rewarded') return false;
  return true;
}

ok(!shouldReward({ id: 'r1', referrer_user_id: 'u1', referred_user_id: 'u1', status: 'qualified' }),
  'self-referral not rewarded');
ok(!shouldReward({ id: 'r1', referrer_user_id: 'u1', referred_user_id: 'u2', status: 'rewarded' }),
  'already rewarded not re-rewarded');
ok(shouldReward({ id: 'r1', referrer_user_id: 'u1', referred_user_id: 'u2', status: 'qualified' }),
  'qualified referral can be rewarded');
ok(!shouldReward(null), 'null referral not rewarded');
ok(!shouldReward({ id: 'r1', referrer_user_id: null, referred_user_id: 'u2', status: 'qualified' }),
  'missing referrer not rewarded');

// ── Referral link format ────────────────────────────────────────────────

function buildReferralLink(code) {
  return `https://app.pocketrep.pro/?ref=${encodeURIComponent(code)}`;
}

const link = buildReferralLink('PR-1A2B3C4D5E');
ok(link === 'https://app.pocketrep.pro/?ref=PR-1A2B3C4D5E', 'referral link format correct');
ok(link.includes('ref=PR-'), 'link contains ref param with PR- prefix');
ok(!link.includes('@'), 'link does not contain email');

// ── Referral lifecycle states ───────────────────────────────────────────

const VALID_STATES = ['pending', 'verified', 'qualified', 'rewarded', 'ineligible', 'canceled'];
ok(VALID_STATES.includes('pending'), 'pending is valid state');
ok(VALID_STATES.includes('verified'), 'verified is valid state');
ok(VALID_STATES.includes('qualified'), 'qualified is valid state');
ok(VALID_STATES.includes('rewarded'), 'rewarded is valid state');
ok(!VALID_STATES.includes('paid'), 'paid is not a valid state');



// ── Atomic 24-month reward cap ─────────────────────────────────────────

const { readFileSync } = await import('node:fs');
const migrationSource = readFileSync('supabase/migrations/20260902133500_referral_reward_cap_atomic.sql', 'utf8');
const webhookSource = readFileSync('supabase/functions/stripe-webhook/index.ts', 'utf8');
const schedulerSource = readFileSync('supabase/functions/nurture-scheduler/index.ts', 'utf8');

ok(migrationSource.includes('pg_advisory_xact_lock'),
  '24-month cap reservation serializes concurrent rewards per recipient');
ok(migrationSource.includes("status in ('pending', 'applied')"),
  'pending reservations count toward the 24-month cap');
ok(migrationSource.includes("'cap_reached'::text"),
  'atomic reservation returns an explicit cap-reached result');
ok(migrationSource.includes("auth.role() <> 'service_role'"),
  'reward reservation RPC is service-role only');
ok(webhookSource.includes('admin.rpc("reserve_referral_reward"'),
  'Stripe webhook uses atomic reward reservation');
ok(schedulerSource.includes("admin.rpc('reserve_referral_reward'"),
  'referral reconciliation uses atomic reward reservation');
ok(!webhookSource.includes('const totalApplied ='),
  'Stripe webhook no longer performs the race-prone read-then-insert cap check');
ok(!schedulerSource.includes('const totalApplied ='),
  'reconciliation no longer performs the race-prone read-then-insert cap check');

// ── Summary ─────────────────────────────────────────────────────────────

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
} else {
  console.log(`✅ ALL PASSED (${passed} checks)`);
}
