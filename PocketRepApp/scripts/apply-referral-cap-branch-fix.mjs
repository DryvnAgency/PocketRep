import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const webhookPath = 'PocketRepApp/supabase/functions/stripe-webhook/index.ts';
let webhook = readFileSync(webhookPath, 'utf8');
const ugly = "`subscriptions?customer=${encodeURIComponent(p.stripe_customer_id)}&status=all&limit=10`.replace(' ','')";
const clean = "`subscriptions?customer=${encodeURIComponent(p.stripe_customer_id)}&status=all&limit=10`";
if (!webhook.includes(ugly)) throw new Error('expected temporary webhook URL expression not found');
webhook = webhook.replace(ugly, clean);
writeFileSync(webhookPath, webhook);

const testPath = 'PocketRepApp/scripts/test-referral.mjs';
let test = readFileSync(testPath, 'utf8');
const marker = '// ── Atomic 24-month reward cap ─────────────────────────────────────────';
if (!test.includes(marker)) {
  const block = String.raw`

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
`;
  const summary = '// ── Summary ─────────────────────────────────────────────────────────────';
  if (!test.includes(summary)) throw new Error('referral summary marker missing');
  test = test.replace(summary, block + '\n' + summary);
  writeFileSync(testPath, test);
}

unlinkSync('PocketRepApp/scripts/apply-referral-cap-branch-fix.mjs');
