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

inc('landing', landing, ['"price":"39.00"','<span class="now">$39</span>','Founding Rep access is $39/month','Day 8 — $39/mo begins if the subscription is still active','Is PocketRep worth $39 a month?','$39/mo Founding Rep rate.','Founding rate · $39/mo while subscription stays active',CURRENT_URL,'7-day free trial','V1 · Know who to work','V2 · Know exactly what to do','V3 · Run your business','$59 <small>/mo · reps 501–1,000</small>','$79 <small>/mo · rep 1,001+</small>','first 500 paying reps are $39/mo','reps 501–1,000 are $59/mo','rep 1,001+ is $79/mo','Native PocketRep apps for iPhone and Android','href="#try" aria-label="Jump to the interactive PocketRep demo"']);
exc('landing', landing, [RETIRED_29_URL,'"price":"29.00"','<span class="now">$29</span>','Founding Rep access is $29/month','Day 8 — $29/mo begins','Is PocketRep worth $29 a month?','$29/mo Founding Rep rate.','Founding rate · $29/mo while subscription stays active','Next new-customer cohort: $54/mo after the first 500','39 USD per month for the first 500','$39/mo founding rate for the first 500 paying reps','Founding rate · $39/mo locked forever','$49 <small>planned new-customer rate','$69 <small>planned new-customer rate','still here with your name on it','trade at the top of the range','charging + warranty are no contest','saved you the 540i','m340i in portimao is rare','want me to hold it while you decide']);
inc('thankyou', thankyou, ['$39 founding software subscription rate']); exc('thankyou', thankyou, ['$29 founding software subscription rate']);
inc('llms', llms, ['$39 per month','7-day free trial','continuously active']); exc('llms', llms, ['$29 per month']);
inc('signup', signup, [CURRENT_URL,'FOUNDING REP','$39','automotive sales reps']); exc('signup', signup, [RETIRED_29_URL,'$29',"name: 'Rex Lens'","name: 'PocketRep Elite",'What do you sell?']);
inc('checkout-account', checkout, [`const V1_CURRENT_PRICE_ID = "${CURRENT_PRICE}"`,`const V1_LEGACY_29_PRICE_ID = "${LEGACY_29_PRICE}"`,'allowedStripePriceIds()','!allowedPriceIds.has(checkoutPriceId)','account_already_billed']);
inc('decisions', decisions, ['**V1 Founding Rep: $39/month**','temporary $29 launch cutover is **retired**',`Current V1 price: \`${CURRENT_PRICE}\` — $39/month`,`Checkout URL: \`${CURRENT_URL}\``,'**Reps #501–1,000: $59/month**','**Rep #1,001+: $79/month**','**#1–500 = $39 → #501–1,000 = $59 → #1,001+ = $79**','**RexLens is separate/out-of-scope from PocketRep.']);
console.log('PocketRep V1 $39 pricing alignment guard OK');
