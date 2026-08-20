/**
 * Targeted production-hardening checks for the native SMS blast and Stripe
 * webhook retry paths. These are source-level guardrails for behavior that
 * depends on native OS UI / Stripe delivery and cannot be fully exercised in
 * a plain Node test runner.
 */
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;
function ok(condition, label) {
  if (condition) { passed++; console.log(`PASS  ${label}`); }
  else { failed++; console.error(`FAIL  ${label}`); }
}

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const blast = read('components/v2/BlastSequenceDrafter.tsx');
const sms = read('lib/v2/smsLauncher.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const migration = read('../supabase/migrations/20260821_production_retry_and_sms_dedupe.sql');

ok(blast.includes("source: 'blast'"), 'blast sends identify SMS source as blast');
ok(blast.includes('Do not create a second SMS'), 'real blast path documents single authoritative SMS action');
ok(!blast.includes("recordSentBlast({\n              contactId: s.contact_id,\n              message: s.message,\n              language: s.language,\n              hookUsed: s.hook_used,\n            }).catch(() => undefined);"), 'real blast path does not create a duplicate history action');
ok(blast.includes('✓ SENT'), 'confirmed blast UI says SENT rather than OPENED');

ok(sms.includes("return sent ? 'opened' : 'not_sent';"), 'SMS launcher only returns opened after confirmation');
ok(sms.includes("status: 'opened'"), 'SMS composer-open state is recorded separately');
ok(sms.includes('markSmsSent'), 'confirmed SMS transitions to sent state');
ok(sms.includes('markSmsNotSent'), 'negative confirmation transitions to not_sent state');

ok(webhook.includes('status: "processing"'), 'Stripe webhook claims events in processing state');
ok(webhook.includes('existing?.status === "processed"'), 'processed Stripe events are ignored on redelivery');
ok(webhook.includes('existing?.status === "failed" || stale'), 'failed/stale Stripe events can retry');
ok(webhook.includes('status: "failed"'), 'failed Stripe events are persisted for retry');
ok(webhook.includes('status: "processed"'), 'successful Stripe events are marked processed');
ok(webhook.includes('return new Response("Webhook already processing", { status: 409'), 'concurrent webhook delivery receives retryable response');

ok(migration.includes('ALTER COLUMN processed_at DROP NOT NULL'), 'webhook ledger permits in-progress events');
ok(migration.includes('prevent_duplicate_blast_sms_action'), 'database blast-action dedupe trigger exists');
ok(migration.includes("RETURN NULL;"), 'duplicate blast action is suppressed at the database boundary');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
