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

inc('landing', landing, [
  '"price":"39.00"', '<span class="now">$39</span>', 'Day 8 — $39/mo begins if the subscription is still active',
  'Is PocketRep worth $39 a month?', CURRENT_URL, '7-day free trial',
  'first ~500 paying reps', '$59/mo', '$79/mo', '1,001st rep onward',
  'Available now · V1', 'Building next · V2', 'The vision · V3',
  'Native iPhone and Android apps', 'No promised dates',
  'Not a current feature, not a promised date, not something you can buy today',
  '<a class="radar" id="stage" href="#try" aria-label="Play with the interactive PocketRep demo">',
  '▶ LIVE DEMO', '/terms.html', '/privacy.html', '/cancel.html', 'service@pocketrep.pro',
  'Secure checkout and billing by Stripe',
]);
exc('landing', landing, [
  RETIRED_29_URL, '"price":"29.00"', '<span class="now">$29</span>', 'Founding Rep access is $29/month',
  'Day 8 — $29/mo begins', 'Is PocketRep worth $29 a month?', '$29/mo Founding Rep rate.',
  'Next new-customer cohort: $54/mo after the first 500', '$54/mo', '$69/mo',
  'pr_founding_deadline', 'countdown to founding-rate deadline', 'id="countdown"',
  'cohortCount', 'signupCount', 'getCohort', 'currentCohort',
]);

inc('thankyou', thankyou, [
  '$39 founding rate stays locked in for as long as your subscription remains continuously active',
  'install.html', 'action:"verify",session_id:sessionId', 'action:"provision",session_id:sessionId',
  'account_already_billed', 'id="loading"', 'id="error"', 'id="formState"', 'id="done"',
  'id="email"', 'id="password"', 'id="confirm"', 'id="submit"', 'id="continue"', 'id="retry"', 'id="form"',
]);
exc('thankyou', thankyou, ['$29 founding software subscription rate', 'setTimeout(function(){location.href=link;},800);']);

inc('llms', llms, ['$39 per month', '7-day free trial', 'continuously active', '$59/month', '$79/month']);
exc('llms', llms, ['$29 per month']);
inc('signup', signup, [CURRENT_URL, 'FOUNDING REP', '$39', 'automotive sales reps']);
exc('signup', signup, [RETIRED_29_URL, '$29', "name: 'Rex Lens'", "name: 'PocketRep Elite", 'What do you sell?']);
inc('checkout-account', checkout, [
  `const V1_CURRENT_PRICE_ID = "${CURRENT_PRICE}"`, `const V1_LEGACY_29_PRICE_ID = "${LEGACY_29_PRICE}"`,
  'allowedStripePriceIds()', '!allowedPriceIds.has(checkoutPriceId)', 'account_already_billed',
]);
inc('decisions', decisions, [
  '**V1 Founding Rep: $39/month**', 'temporary $29 launch cutover is **retired**',
  `Current V1 price: \`${CURRENT_PRICE}\` — $39/month`, `Checkout URL: \`${CURRENT_URL}\``,
  '**Reps #501–1,000: $59/month**', '**Rep #1,001+: $79/month**',
  '**first ~500 paying reps = $39 → next ~500 = $59 → then $79**',
  'Cutovers are owner-managed manually', 'A short burst of additional signups at the prior rate during a rush is acceptable',
  '**RexLens is separate/out-of-scope from PocketRep.',
]);

console.log('PocketRep founding funnel guard OK: $39/$59/$79, grandfathering, static owner-managed cutovers, honest V1/V2/V3, live demo, and trust/legal.');
