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

const NEW_URL = 'https://buy.stripe.com/3cI3cw3fRcQM141bYScbC09';
const OLD_URL = 'https://buy.stripe.com/cNi4gAbMn4kg9Ax5AucbC06';
const V1_PRICE = 'price_1UBDLeIKMImSDGHZqrYthX3H';

function requireIncludes(label, source, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
  }
}

function requireExcludes(label, source, needles) {
  for (const needle of needles) {
    if (source.includes(needle)) throw new Error(`${label}: stale/unsupported launch value remains: ${needle}`);
  }
}

requireIncludes('landing', landing, [
  '"price":"29.00"',
  '<span class="now">$29</span>',
  'Founding Rep access is $29/month',
  'Day 8 — $29/mo begins if the subscription is still active',
  'Is PocketRep worth $29 a month?',
  '$29/mo Founding Rep rate.',
  'Founding rate · $29/mo while subscription stays active',
  NEW_URL,
  '7-day free trial',
]);
requireExcludes('landing', landing, [
  OLD_URL,
  'Next new-customer cohort: $54/mo after the first 500',
  'First 500 paying reps',
  '39 USD per month for the first 500',
  'The first 500 paying reps get the $39 monthly founding rate',
  'the $39 founding subscription begins on day 8',
  'Day 8 — $39/mo begins',
  'Is it really worth $39 a month?',
  '$39/mo founding rate for the first 500 paying reps',
  'Founding rate · $39/mo locked forever',
  'still here with your name on it',
  'trade at the top of the range',
  'charging + warranty are no contest',
  'saved you the 540i',
  'm340i in portimao is rare',
  'want me to hold it while you decide',
]);

requireIncludes('thankyou', thankyou, ['$29 founding software subscription rate']);
requireExcludes('thankyou', thankyou, ['$39 founding rate']);

requireIncludes('llms', llms, ['$29 per month', '7-day free trial', 'continuously active']);
requireExcludes('llms', llms, ['$39 per month for the first 500']);

requireIncludes('signup', signup, [NEW_URL, 'FOUNDING REP', '$29', 'automotive sales reps']);
requireExcludes('signup', signup, [OLD_URL, "name: 'Rex Lens'", "name: 'PocketRep Elite", 'What do you sell?']);

requireIncludes('checkout-account', checkout, [
  `const V1_FOUNDING_PRICE_ID = "${V1_PRICE}"`,
  'allowedStripePriceIds()',
  '!allowedPriceIds.has(checkoutPriceId)',
  'account_already_billed',
]);

requireIncludes('decisions', decisions, [
  '**V1 Founding Rep: $29/month**',
  '**V2 direction for new customers: $49/month**',
  '**V3 direction for new customers: $69/month**',
  '**RexLens is separate/out-of-scope from PocketRep.',
]);
requireExcludes('decisions', decisions, ['Users 1–500: **$39/month**', 'Users 501–1,000: **$54/month**']);

console.log('PocketRep V1 pricing cutover guard OK');
