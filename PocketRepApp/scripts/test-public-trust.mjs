import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = (name) => fs.readFileSync(path.join(root, 'Pocketrep', name), 'utf8');

const index = read('index.html');
const privacy = read('privacy.html');
const terms = read('terms.html');
const cancel = read('cancel.html');
let failures = 0;
const ok = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
};

console.log('\n--- public launch positioning ---');
ok('hero radar routes to interactive demo', /href=["']#try["']/.test(index));
ok('founding ladder keeps $39 then $59 then $79', index.includes('$39/mo') && index.includes('$59/mo') && index.includes('$79/mo'));
ok('joined software rate is grandfathered while continuously active', /continuously active/i.test(index));
ok('V2 is Building Next without a delivery date', /BUILDING NEXT/i.test(index) && /native iPhone/i.test(index) && /Android/i.test(index));
ok('V3 remains vision framing', /personal sales operating system/i.test(index) || /sales operating-system/i.test(index));

console.log('\n--- trust and legal consistency ---');
ok('legal pages do not advertise retired Rex Lens product', ![privacy, terms, cancel].some(x => /Rex Lens/i.test(x)));
ok('trial cancellation ends access immediately', /access ends when you cancel/i.test(cancel));
ok('trial cancellation prevents the first paid charge', /no paid subscription fee is charged/i.test(cancel));
ok('paid cancellation keeps access through the current paid billing period', /remains available through the end of the current paid billing period/i.test(cancel));
ok('paid cancellation stops the next renewal', /will not renew for the next billing cycle/i.test(cancel));
ok('already-collected subscription charges are non-refundable', /charges already collected are non-refundable/i.test(cancel));
ok('cancellation page does not defer policy to Stripe', !/unless Stripe shows otherwise/i.test(cancel));
ok('Terms repeat immediate trial-cancel access loss', /cancel during the free trial[\s\S]*access ends when you cancel/i.test(terms));
ok('Terms repeat paid-through cancellation access', /cancel after a paid subscription has begun[\s\S]*access remains available through the end of the current paid billing period/i.test(terms));
ok('Terms repeat no-prorated-refund policy', /do not provide partial or prorated refunds/i.test(terms));
ok('Stripe customer portal cancellation remains visible', /Stripe Customer Portal/i.test(cancel));
ok('privacy keeps AI providers model-agnostic', /third-party AI gateways and model providers/i.test(privacy));
ok('service and privacy contacts remain visible', terms.includes('service@pocketrep.pro') && cancel.includes('service@pocketrep.pro') && privacy.includes('privacy@pocketrep.pro'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
