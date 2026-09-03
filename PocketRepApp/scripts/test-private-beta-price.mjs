import fs from 'node:fs';
const src = fs.readFileSync(new URL('../supabase/functions/checkout-account/index.ts', import.meta.url), 'utf8');
const required = [
  'price_1Tf6MeIKMImSDGHZvYLmeIqS',
  'price_1UBcFZIKMImSDGHZCssLTTzR',
  'price_1UBDLeIKMImSDGHZqrYthX3H',
];
for (const id of required) {
  if (!src.includes(id)) throw new Error(`checkout-account missing allowed price ${id}`);
}
if (!src.includes('V1_PRIVATE_BETA_25_PRICE_ID')) throw new Error('private beta price constant missing');
if (!src.includes('allowedStripePriceIds')) throw new Error('Stripe price allowlist missing');
console.log('PASS private $25 beta price provisioning guard');
