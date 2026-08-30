/**
 * Source-level guardrails for interaction behavior that depends on browser,
 * native dialer/mail UI, and authenticated Supabase state.
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

const profile = read('components/v2/ProfileTab.tsx');
const settings = read('components/v2/SettingEditSheet.tsx');
const contacts = read('components/v2/ContactsTab.tsx');
const contactDetail = read('components/v2/ContactDetail.tsx');
const followUps = read('components/v2/FollowUpQueue.tsx');
const appShell = read('components/v2/AppShell.tsx');

ok(profile.includes('window.location.assign(data.url)'), 'billing uses a reliable same-tab Stripe handoff');
ok(!profile.includes("open?.(data.url, '_blank')"), 'billing does not rely on a delayed popup');
ok(profile.includes("const { error } = await supabase.from('profiles').update"), 'profile name waits for the database result');
ok(settings.includes('await onSave(value.trim())'), 'settings sheet waits for save before closing');
ok(settings.includes("setError(e?.message ?? \"Couldn't save this setting\")"), 'settings sheet keeps a failed save visible');
ok(profile.includes('setSendHourState(previous)'), 'failed send-time save rolls the UI back');

ok(appShell.includes('setSearchFocusKey(k => k + 1)'), 'top search requests input focus');
ok(contacts.includes('searchRef.current?.focus()'), 'contacts search honors the focus request');
ok(contacts.includes('if (current.isDemo) { setCalled(true); actionBusyRef.current = false; return; }'), 'demo call queue never dials a carrier');
ok(contacts.includes("Couldn't open the phone app"), 'call queue exposes dialer failures');

ok(contactDetail.includes("flash(didCopy ? '✓ Copied'"), 'copy reports the real clipboard result');
ok(!contactDetail.includes('recordTouch(compose.mode, body);\n                  setCompose(null);'), 'copy/open does not silently log a completed touch');
ok(contactDetail.includes("compose.opened"), 'web contact actions require explicit completion');
ok(followUps.includes("'work' | 'complete' | 'skip'"), 'follow-up queue has an explicit completion action');
ok(followUps.includes("setOpenedKey(key)"), 'opened call/email stays pending');
ok(followUps.includes('MARK COMPLETE ✓'), 'rep sees a clear completion control');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
