import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const repoRoot = resolve(appRoot, '..');
const landing = readFileSync(resolve(repoRoot, 'Pocketrep/index.html'), 'utf8');
const thankyou = readFileSync(resolve(repoRoot, 'Pocketrep/thankyou.html'), 'utf8');
const llms = readFileSync(resolve(repoRoot, 'Pocketrep/llms.txt'), 'utf8');
const signup = readFileSync(resolve(appRoot, 'app/(auth)/signup.tsx'), 'utf8');
const checkout = readFileSync(resolve(appRoot, 'supabase/functions/checkout-account/index.ts'), 'utf8');
const decisions = readFileSync(resolve(repoRoot, 'CURRENT_STATE_DECISIONS.md'), 'utf8');
const CURRENT_URL = 'https://buy.stripe.com/cNi4gAbMn4kg9Ax5AucbC06';
const RETIRED_29_URL = 'https://buy.stripe.com/3cI3cw3fRcQM141bYScbC09';
const CURRENT_PRICE = 'price_1Tf6MeIKMImSDGHZvYLmeIqS';
const LEGACY_29_PRICE = 'price_1UBDLeIKMImSDGHZqrYthX3H';

function inc(label, source, needles) { for (const n of needles) if (!source.includes(n)) throw new Error(`${label}: missing ${n}`); }
function exc(label, source, needles) { for (const n of needles) if (source.includes(n)) throw new Error(`${label}: stale/unsupported ${n}`); }

// --- Landing: $39 remains the live, current founding price, now framed as ----
// the first rung of an owner-managed cohort ladder (2026-09-04), not a flat
// permanent single price and not the earlier-killed $39/$54/$69 ladder.
inc('landing', landing, [
  '"price":"39.00"',
  '<span class="now">$39</span>',
  'Founding Rep access is $39/month',
  'Day 8 — $39/mo begins if the subscription is still active',
  'Is PocketRep worth $39 a month?',
  'Founding rate · $39/mo while subscription stays active',
  CURRENT_URL,
  '7-day free trial',
  // the new cohort ladder — first tier is today's real, live price
  'first ~500 paying reps',
  '$59/mo',
  '$79/mo',
  '1,001st rep onward',
  "it doesn't rise when the next cohort opens",
  // truthful, non-manipulative framing of the ladder (no fake countdown/scarcity)
  'Will my price go up later?',
  'that never changes the rate on your existing account',
]);
exc('landing', landing, [
  RETIRED_29_URL, '"price":"29.00"', '<span class="now">$29</span>',
  'Founding Rep access is $29/month', 'Day 8 — $29/mo begins',
  'Is PocketRep worth $29 a month?', '$29/mo Founding Rep rate.',
  'Founding rate · $29/mo while subscription stays active',
  // the previously-killed ladder must never reappear, even by these numbers
  'Next new-customer cohort: $54/mo after the first 500',
  '$54/mo', '$69/mo',
  'First 500 paying reps', '39 USD per month for the first 500',
  'The first 500 paying reps get the $39 monthly founding rate',
  '$39/mo founding rate for the first 500 paying reps',
  'Founding rate · $39/mo locked forever',
  // no invented testimonials/results/customers
  'still here with your name on it', 'trade at the top of the range',
  'charging + warranty are no contest', 'saved you the 540i',
  'm340i in portimao is rare', 'want me to hold it while you decide',
]);

console.log('\n--- V1/V2/V3 roadmap positioning is present and honestly scoped ---');
inc('landing (roadmap)', landing, [
  'Available now · V1', 'Building next · V2', 'The vision · V3',
  'Native iPhone and Android apps', 'No promised dates',
  'Not a current feature, not a promised date, not something you can buy today',
]);
exc('landing (roadmap)', landing, [
  // V2/V3 must never carry a concrete date commitment
  'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027', 'coming in 2027', 'launching in 2027',
]);

console.log('\n--- hero radar is a real, direct entry point into the interactive demo ---');
inc('landing (radar)', landing, [
  '<a class="radar" id="stage" href="#try" aria-label="Play with the interactive PocketRep demo">',
  '▶ LIVE DEMO',
]);

console.log('\n--- no fabricated urgency (dead countdown-to-deadline mechanic removed) ---');
exc('landing (urgency)', landing, [
  'id="countdown"', 'pr_founding_deadline', 'countdown to founding-rate deadline',
]);

console.log('\n--- no atomic cohort logic on the marketing site (owner-managed cutovers only) ---');
exc('landing (no atomic cohort logic)', landing, [
  'cohortCount', 'signupCount', 'getCohort', 'currentCohort',
]);
// The checkout handoff must still be the single static Stripe URL — no
// client-side tier selection based on any live count.
inc('landing (single static checkout URL)', landing, [
  'var POCKETREP_STRIPE_URL = "' + CURRENT_URL + '";',
]);

console.log('\n--- no fabricated testimonials ---');
inc('landing (no testimonials)', landing, ['Testimonials intentionally omitted: no invented quotes']);

// --- Thank-you page: account-creation JS contract must be byte-identical ----
// in the parts that matter (this page creates the real Supabase account) —
// only presentation/copy may change.
console.log('\n--- thank-you page: real account-creation contract is untouched ---');
inc('thankyou (js contract)', thankyou, [
  'var SUPABASE_URL="https://fwvrauqdoevwmwwqlfav.supabase.co";',
  'var FN=SUPABASE_URL+"/functions/v1/checkout-account";',
  'action:"verify",session_id:sessionId',
  'action:"provision",session_id:sessionId',
  'account_already_billed',
  'id="loading"', 'id="error"', 'id="formState"', 'id="done"',
  'id="email"', 'id="password"', 'id="confirm"', 'id="submit"', 'id="continue"', 'id="retry"', 'id="form"',
]);
inc('thankyou', thankyou, [
  '$39 founding rate stays locked in for as long as your subscription remains continuously active',
  'install.html',
]);
exc('thankyou', thankyou, ['$29 founding software subscription rate', '$29 founding rate']);

console.log('\n--- thank-you page no longer auto-redirects the moment the account is created ---');
exc('thankyou (no silent auto-redirect)', thankyou, [
  'setTimeout(function(){location.href=link;},800);',
]);

// --- llms.txt: AI-readable pricing facts stay accurate --------------------
inc('llms', llms, [
  '$39 per month', '7-day free trial', 'continuously active',
  '$59/month', '$79/month', 'This never changes the rate on an existing subscription',
]);
exc('llms', llms, ['$29 per month']);

// --- Native V1 signup screen + checkout-account: unchanged, still accurate --
// (app integration files — not touched by this marketing lane; $39 remains
// the correct live price so no change was needed here).
inc('signup', signup, [CURRENT_URL, 'FOUNDING REP', '$39', 'automotive sales reps']);
exc('signup', signup, [RETIRED_29_URL, '$29', "name: 'Rex Lens'", "name: 'PocketRep Elite", 'What do you sell?']);
inc('checkout-account', checkout, [
  `const V1_CURRENT_PRICE_ID = "${CURRENT_PRICE}"`,
  `const V1_LEGACY_29_PRICE_ID = "${LEGACY_29_PRICE}"`,
  'allowedStripePriceIds()', '!allowedPriceIds.has(checkoutPriceId)', 'account_already_billed',
]);

// --- CURRENT_STATE_DECISIONS.md: source of truth reflects the new ladder ---
console.log('\n--- CURRENT_STATE_DECISIONS.md reflects the new owner-approved cohort ladder ---');
inc('decisions', decisions, [
  '**First ~500 paying reps: $39/month.**',
  '**Next ~500 (~501–1,000): $59/month.**',
  '**1,001st paying rep onward: $79/month**',
  'manually owner-managed',
  'no automatic/atomic cohort-count trigger in code, and none should be built',
  `Current V1 price: \`${CURRENT_PRICE}\` — $39/month`,
  `Checkout URL: \`${CURRENT_URL}\``,
  'temporary $29 launch cutover remains **retired**',
  '**RexLens is separate/out-of-scope from PocketRep.',
  // the doc must explicitly flag the superseded old ladder rather than silently drop it
  'is **superseded** by a new, owner-approved user-count ladder',
  'Needs owner reconciliation',
]);

console.log('\nPocketRep pricing alignment guard OK: $39/$59/$79 cohort ladder, verified truthful V1/V2/V3 roadmap, no fabricated urgency, no atomic cohort logic, real account-creation JS untouched.');
