/**
 * Native build and mobile workflow guardrails that do not require a simulator.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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
const pkg = JSON.parse(read('package.json'));
const flags = read('lib/featureFlags.ts');
const sequences = read('app/(tabs)/sequences.tsx');
const contacts = read('app/(tabs)/contacts.tsx');
const deals = read('app/(tabs)/deals.tsx');
const supabase = read('lib/supabase.ts');
const chunkedSecureStorage = read('lib/v2/chunkedSecureStorage.ts');
const repSettings = read('lib/v2/repSettings.ts');
const localSessionClear = read('lib/v2/localSessionClear.ts');
const appShell = read('components/v2/AppShell.tsx');
const useContacts = read('lib/v2/useContacts.ts');
const useTags = read('lib/v2/useTags.ts');
const payPlan = read('lib/v2/payPlan.ts');
const notifications = read('lib/v2/notifications.ts');

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
ok(pkg.dependencies?.['expo-linking'] === '~6.3.1', 'Expo Linking matches the Expo 51 compatibility range');
ok(pkg.dependencies?.['expo-image-picker'] === '~15.1.0', 'Expo Image Picker matches the Expo 51 compatibility range');
ok(flags.includes("process.env.EXPO_PUBLIC_NEW_UI === '1'"), 'native V2 cutover remains an explicit build flag');
ok(sequences.includes("source: 'sequence'"), 'native sequence texts use the audited SMS launcher');
ok(contacts.includes('massTextSendingRef.current'), 'native mass text has a same-tick duplicate guard');
ok(deals.includes('parseGrossInput(form.front_gross)'), 'native deal logging uses decimal-safe gross validation');
ok(supabase.includes('createChunkedSecureStorage(SecureStore)'), 'native Supabase auth uses chunked encrypted session storage');
ok(repSettings.includes("AsyncStorage.setItem(KEY"), 'native rep settings persist to device storage');
ok(appShell.includes('await hydrateRepSettings()'), 'native rep settings hydrate before the authenticated shell renders');
ok(localSessionClear.includes('AsyncStorage.getAllKeys()') && localSessionClear.includes("key.startsWith(PREFIX)"), 'native sign-out sweeps every PocketRep V2 device cache');
ok(
  ['resetRexSettingsCache()', 'resetCoachLogCache()', 'resetNotificationReadsCache()', 'clearDemoSim()', 'resetInventoryCache()']
    .every(call => localSessionClear.includes(call)),
  'native sign-out clears every legacy in-memory per-rep cache',
);
ok(useContacts.includes('setContacts(null)') && useContacts.includes('setError(null)'), 'contacts clear immediately when the authenticated session ends');
ok(useTags.includes('setTags([])'), 'tags clear immediately when the authenticated session ends');
ok(payPlan.includes('setPlan(null)'), 'pay plan clears immediately when the authenticated session ends');
ok(notifications.includes('setRaw([])'), 'notifications clear immediately when the authenticated session ends');

const storageOutput = ts.transpileModule(chunkedSecureStorage, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const storageModule = { exports: {} };
new Function('module', 'exports', storageOutput.outputText)(storageModule, storageModule.exports);
const memory = new Map();
const fakeSecureStore = {
  getItemAsync: async key => memory.get(key) ?? null,
  setItemAsync: async (key, value) => { memory.set(key, value); },
  deleteItemAsync: async key => { memory.delete(key); },
};
const authStorage = storageModule.exports.createChunkedSecureStorage(fakeSecureStore, 64);
const largeSession = JSON.stringify({ access_token: 'a'.repeat(4200), user: { name: 'José 🚗' } });
await authStorage.setItem('auth-token', largeSession);
ok([...memory.keys()].filter(key => key.includes('.chunk.')).length > 2, 'large native auth sessions are split across SecureStore entries');
ok(await authStorage.getItem('auth-token') === largeSession, 'chunked native auth sessions round-trip Unicode exactly');
ok([...memory.entries()].filter(([key]) => key.includes('.chunk.')).every(([, value]) => value.length <= 64), 'native auth chunks stay under the configured per-entry limit');
await authStorage.removeItem('auth-token');
ok(await authStorage.getItem('auth-token') === null, 'native sign-out removes the chunked auth session');

await fakeSecureStore.setItemAsync('legacy-auth', 'legacy-session');
ok(await authStorage.getItem('legacy-auth') === 'legacy-session', 'existing unchunked native sessions remain readable');
await authStorage.setItem('legacy-auth', 'migrated-session');
ok(!memory.has('legacy-auth') && await authStorage.getItem('legacy-auth') === 'migrated-session', 'an existing native session migrates to chunked storage on refresh');

const repSettingsOutput = ts.transpileModule(repSettings, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const repSettingsModule = { exports: {} };
const nativePreferences = new Map([
  ['pocketrep:v2:rep-settings', JSON.stringify({ dealership: 'North Star Motors', voiceTone: 'Fire' })],
]);
const fakeAsyncStorage = {
  getItem: async key => nativePreferences.get(key) ?? null,
  setItem: async (key, value) => { nativePreferences.set(key, value); },
};
const fakeRequire = specifier => {
  if (specifier === '@react-native-async-storage/async-storage') return { default: fakeAsyncStorage };
  if (specifier === 'react-native') return { Platform: { OS: 'ios' } };
  throw new Error(`Unexpected test import: ${specifier}`);
};
new Function('require', 'module', 'exports', repSettingsOutput.outputText)(
  fakeRequire,
  repSettingsModule,
  repSettingsModule.exports,
);
await repSettingsModule.exports.hydrateRepSettings();
ok(repSettingsModule.exports.getRepSetting('dealership') === 'North Star Motors', 'native rep settings hydrate from device storage before use');
await repSettingsModule.exports.setRepSetting('title', 'Sales Consultant');
ok(JSON.parse(nativePreferences.get('pocketrep:v2:rep-settings')).title === 'Sales Consultant', 'native rep setting edits survive an app restart');
await repSettingsModule.exports.resetRepSettingsCache();
ok(repSettingsModule.exports.getRepSetting('dealership') === '', 'native sign-out resets in-memory rep preferences');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
