/**
 * Native build and mobile workflow guardrails that do not require a simulator.
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
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const eas = JSON.parse(read('eas.json'));
const app = JSON.parse(read('app.json')).expo;
const flags = read('lib/featureFlags.ts');
const sequences = read('app/(tabs)/sequences.tsx');
const contacts = read('app/(tabs)/contacts.tsx');
const deals = read('app/(tabs)/deals.tsx');

for (const profile of ['development', 'preview', 'production']) {
  const env = eas.build?.[profile]?.env ?? {};
  ok(env.EXPO_PUBLIC_SUPABASE_URL !== '', `${profile} does not override the EAS Supabase URL with an empty value`);
  ok(env.EXPO_PUBLIC_SUPABASE_ANON_KEY !== '', `${profile} does not override the EAS Supabase key with an empty value`);
}

ok(app.ios?.bundleIdentifier === 'pro.pocketrep.app', 'iOS bundle identifier is configured');
ok(app.android?.package === 'pro.pocketrep.app', 'Android package is configured');
ok(app.orientation === 'portrait', 'mobile orientation is explicitly portrait');
ok(app.ios?.infoPlist?.NSContactsUsageDescription, 'iOS contact permission has user-facing copy');
ok(app.android?.permissions?.includes('android.permission.READ_CONTACTS'), 'Android contact permission is declared');
ok(flags.includes("process.env.EXPO_PUBLIC_NEW_UI === '1'"), 'native V2 cutover remains an explicit build flag');
ok(sequences.includes("source: 'sequence'"), 'native sequence texts use the audited SMS launcher');
ok(contacts.includes('massTextSendingRef.current'), 'native mass text has a same-tick duplicate guard');
ok(deals.includes('parseGrossInput(form.front_gross)'), 'native deal logging uses decimal-safe gross validation');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
