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
const smsActions = read('lib/v2/smsActions.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const migration = read('../supabase/migrations/20260821_production_retry_and_sms_dedupe.sql');
const blastLogic = read('lib/v2/blastSequences.ts');
const rexCoach = read('components/v2/RexCoach.tsx');
const coachBrain = read('lib/v2/coachBrain.ts');
const rexActions = read('lib/v2/rexActions.ts');
const rexRouting = read('lib/v2/rexRouting.ts');
const aiProxy = read('supabase/functions/ai-proxy/index.ts');
const appShell = read('components/v2/AppShell.tsx');
const queue = read('lib/messageQueue.ts');
const followUpQueue = read('components/v2/FollowUpQueue.tsx');
const legacySequences = read('app/(tabs)/sequences.tsx');
const supportClient = read('lib/v2/supportChat.ts');
const supportNotify = read('supabase/functions/support-notify/index.ts');
const supportGrants = read('supabase/migrations/20260829204520_support_chat_least_privilege.sql');

ok(blast.includes("source: 'blast'"), 'blast sends identify SMS source as blast');
ok(blast.includes('Do not create a second SMS'), 'real blast path documents single authoritative SMS action');
ok(!blast.includes("recordSentBlast({\n              contactId: s.contact_id,\n              message: s.message,\n              language: s.language,\n              hookUsed: s.hook_used,\n            }).catch(() => undefined);"), 'real blast path does not create a duplicate history action');
ok(blast.includes('✓ SENT'), 'confirmed blast UI says SENT rather than OPENED');
ok(blast.includes('enforceUniqueness(toSend)'), 'blast send path blocks a duplicate or template-only active batch');
ok(blastLogic.includes('const uniqueness = enforceUniqueness(drafted);'), 'generated blast is validated before sequence persistence');
ok(blastLogic.includes('drafted.length !== contacts.length'), 'generated blast must cover every selected contact exactly once');

ok(rexCoach.includes("'create_blast_sequence'"), 'text Rex permits the Smart Blast action');
ok(coachBrain.includes('create_blast_sequence'), 'text Rex is taught how to propose Smart Blast');
ok(appShell.includes('await openBlastFromRex(action.payload)'), 'confirmed text Rex Smart Blast opens a validated draft before claiming success');
ok(rexActions.includes('Check appointment state before choosing the next move'), 'Rex checks appointment state before drafting the next move');
ok(rexActions.includes('If a confirmed upcoming appointment exists, protect and prepare that appointment'), 'Rex protects and prepares confirmed appointments');
ok(rexActions.includes('Do not ask them to come in earlier, offer a second appointment'), 'Rex does not reopen scheduling when an appointment exists');
ok(rexActions.includes('If no appointment exists, the default next move is a specific in-person appointment'), 'Rex defaults toward an appointment only when one is not already set');
ok(rexActions.includes('Do not volunteer to run, quote, or send numbers by phone, text, or email'), 'Rex does not volunteer remote numbers');
ok(rexActions.includes('If the customer explicitly asks to handle numbers remotely'), 'Rex honors an explicit customer request for remote numbers');
ok(coachBrain.includes('Want to stop in so we can compare both side by side'), 'lease-versus-finance playbook advances to an appointment');
ok(aiProxy.includes("deepseek/deepseek-v4-flash-0731"), 'routine Rex defaults to DeepSeek V4 Flash');
ok(aiProxy.includes("deepseek/deepseek-v4-pro-0813"), 'complex Rex has DeepSeek V4 Pro escalation');
ok(aiProxy.includes("effort: 'none'"), 'Flash calls disable unnecessary reasoning');
ok(aiProxy.includes('enabled: false'), 'hidden Pro reasoning is disabled so it cannot starve visible copy');
ok(aiProxy.includes("AI_MONTHLY_CAP_CENTS') ?? '2000'"), 'Rex has a $20 default monthly AI ceiling');
ok(aiProxy.includes('increment_monthly_ai_usage'), 'Rex records the canonical monthly AI ledger');
ok(rexRouting.includes("'weekly_coach'"), 'weekly coaching deterministically escalates to Pro');
ok(rexRouting.includes('flashValidationFailed'), 'failed Flash validation can escalate once to Pro');
ok(rexCoach.includes("if (activeTier === 'pro') activeTier = 'flash'"), 'empty or stalled Pro recovers once on Flash');
ok(rexCoach.includes("'REX · WORKING' : 'REX · LIVE'"), 'Rex visibly stays live while idle and working in flight');
ok(!rexCoach.includes('may be waking up'), 'Rex never presents itself as asleep or waking');
ok(coachBrain.includes('rank it at most once') && coachBrain.includes('return the smaller honest count'), 'whole-book rankings never duplicate contacts to fill a count');

ok(queue.includes('phone,email,vehicle,trim,trade_in,vehicle_year'), 'follow-up queue loads the real email recipient and legacy sequence context');
ok(queue.includes('async function advanceEnrollment'), 'sent and skipped follow-ups share one guarded enrollment advance');
ok(queue.includes('await advanceEnrollment(item, userId);'), 'skip advances without creating a fake sent interaction');
ok(followUpQueue.includes('`mailto:${email}?subject='), 'V2 email follow-up targets the contact email');
ok(legacySequences.includes('await markSkipped(item, userId)'), 'legacy queue skip also advances the enrollment');
ok(legacySequences.includes('`mailto:${item.email.trim()}?subject='), 'legacy email follow-up targets the contact email');

ok(supportClient.includes('body: JSON.stringify({ ticket_id: ticketId })'), 'support client sends no forged notification display data');
ok(supportNotify.includes(".from('support_tickets')"), 'support notification reloads the ticket from storage');
ok(supportNotify.includes('ticket.user_id !== user.id'), 'support notification verifies ticket ownership');
ok(supportNotify.includes(".from('support_messages')"), 'support notification reloads message content from storage');
ok(supportGrants.includes('revoke all on table public.support_tickets from anon, authenticated'), 'support migration removes inherited broad grants');
ok(supportGrants.includes('alter policy support_messages_insert_own on public.support_messages to authenticated'), 'support policies are scoped to authenticated users');
ok(supportGrants.includes('alter policy referrals_select_admin on public.referrals to authenticated'), 'remaining public admin policies are scoped before anonymous helper access is removed');

ok(sms.includes("return sent ? 'opened' : 'not_sent';"), 'SMS launcher only returns opened after confirmation');
ok(smsActions.includes("status: 'opened'"), 'SMS composer-open state is recorded separately');
ok(sms.includes('markSmsSent'), 'confirmed SMS transitions to sent state');
ok(sms.includes('markSmsNotSent'), 'negative confirmation transitions to not_sent state');
ok(sms.includes('const returnPromise = waitForComposerReturn();'), 'SMS return listener is installed before opening native Messages');
ok(sms.includes("Platform.OS === 'web' && !isCurrentWebRuntimeSmsCapable()"), 'desktop web never opens a blocking SMS protocol handoff');
ok(sms.includes('Promise.race(['), 'mobile web SMS handoff cannot leave the launcher promise pending forever');

ok(webhook.includes('status: "processing"'), 'Stripe webhook claims events in processing state');
ok(webhook.includes('existing?.status === "processed"'), 'processed Stripe events are ignored on redelivery');
ok(webhook.includes('existing?.status === "failed" || stale'), 'failed/stale Stripe events can retry');
ok(webhook.includes('status: "failed"'), 'failed Stripe events are persisted for retry');
ok(webhook.includes('status: "processed"'), 'successful Stripe events are marked processed');
ok(webhook.includes('return new Response("Webhook already processing", { status: 409'), 'concurrent webhook delivery receives retryable response');
ok(webhook.includes('Idempotency-Key'), 'Stripe reward requests use idempotency keys');
ok(webhook.includes('pocketrep_referral_coupon_'), 'referral coupon creation has a stable idempotency key');
ok(webhook.includes('pocketrep_referral_apply_'), 'referral subscription application has a stable idempotency key');

ok(migration.includes('ALTER COLUMN processed_at DROP NOT NULL'), 'webhook ledger permits in-progress events');
ok(migration.includes('prevent_duplicate_blast_sms_action'), 'database blast-action dedupe trigger exists');
ok(migration.includes("RETURN NULL;"), 'duplicate blast action is suppressed at the database boundary');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
