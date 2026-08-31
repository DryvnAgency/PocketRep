/**
 * Source-level guardrails for interaction behavior that depends on browser,
 * native dialer/mail UI, and authenticated Supabase state.
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

const profile = read('components/v2/ProfileTab.tsx');
const settings = read('components/v2/SettingEditSheet.tsx');
const contacts = read('components/v2/ContactsTab.tsx');
const contactDetail = read('components/v2/ContactDetail.tsx');
const followUps = read('components/v2/FollowUpQueue.tsx');
const appShell = read('components/v2/AppShell.tsx');
const sms = read('lib/v2/smsLauncher.ts');
const contactSms = read('components/v2/ContactDetail.tsx');
const dealLogger = read('components/v2/DealLogger.tsx');
const dealDetail = read('components/v2/DealDetail.tsx');
const notifications = read('components/v2/NotificationsCenter.tsx');
const rex = read('app/(tabs)/rex.tsx');
const sequences = read('app/(tabs)/sequences.tsx');
const sequenceEditor = read('components/v2/SequenceEditor.tsx');
const sequenceTemplates = read('lib/v2/sequenceTemplates.ts');
const messageQueue = read('lib/messageQueue.ts');
const legacyDeals = read('app/(tabs)/deals.tsx');
const legacyContacts = read('app/(tabs)/contacts.tsx');
const legacyMore = read('app/(tabs)/more.tsx');

ok(profile.includes('window.location.assign(data.url)'), 'billing uses a reliable same-tab Stripe handoff');
ok(!profile.includes("open?.(data.url, '_blank')"), 'billing does not rely on a delayed popup');
ok(profile.includes("const { error } = await supabase.from('profiles').update"), 'profile name waits for the database result');
ok(profile.includes("if (!value.trim()) throw new Error('Enter your name before saving.')"), 'profile cannot save a blank rep name');
ok(settings.includes('await onSave(value.trim())'), 'settings sheet waits for save before closing');
ok(settings.includes("setError(e?.message ?? \"Couldn't save this setting\")"), 'settings sheet keeps a failed save visible');
ok(profile.includes('setSendHourState(previous)'), 'failed send-time save rolls the UI back');

ok(appShell.includes('setSearchFocusKey(k => k + 1)'), 'top search requests input focus');
ok(contacts.includes('searchRef.current?.focus()'), 'contacts search honors the focus request');
ok(contacts.includes('if (current.isDemo) { setCalled(true); actionBusyRef.current = false; return; }'), 'demo call queue never dials a carrier');
ok(contacts.includes("Couldn't open the phone app"), 'call queue exposes dialer failures');
ok(contacts.includes("Platform.OS === 'web' && !isCurrentWebRuntimeNativeProtocolCapable()"), 'desktop call queue never opens a blocking tel protocol handoff');
ok(contacts.includes('Call from your phone, then record the outcome here.'), 'desktop call queue still lets the rep record an outcome');

ok(contactDetail.includes("flash(didCopy ? '✓ Copied'"), 'copy reports the real clipboard result');
ok(!contactDetail.includes('recordTouch(compose.mode, body);\n                  setCompose(null);'), 'copy/open does not silently log a completed touch');
ok(contactDetail.includes("compose.opened"), 'web contact actions require explicit completion');
ok(followUps.includes("'work' | 'complete' | 'skip'"), 'follow-up queue has an explicit completion action');
ok(followUps.includes("setOpenedKey(key)"), 'opened call/email stays pending');
ok(followUps.includes('MARK COMPLETE ✓'), 'rep sees a clear completion control');
ok(sms.includes("Platform.OS === 'web' && !isCurrentWebRuntimeSmsCapable()"), 'desktop web is blocked before an SMS protocol handoff can strand the UI');
ok(followUps.includes("result === 'unsupported'"), 'sequence follow-up keeps unsupported SMS work pending with an explicit error');
ok(contactSms.includes("compose.mode === 'text' && !isCurrentWebRuntimeSmsCapable()"), 'contact composer also blocks unsupported desktop SMS handoffs');
ok(contactDetail.includes("compose.mode === 'call' && !isCurrentWebRuntimeNativeProtocolCapable()"), 'contact composer blocks unsupported desktop dialer handoffs');
ok(followUps.includes("item.channel === 'call'"), 'sequence follow-up explains unsupported desktop calls without completing them');
ok(followUps.includes('item.unresolved_tokens?.length'), 'sequence work is blocked while customer-facing tokens are unresolved');
ok(followUps.includes('Needs setup:'), 'queue replaces raw unresolved token copy with a setup warning');
ok(messageQueue.includes(".select('full_name')"), 'sequence personalization loads the canonical rep name');
ok(messageQueue.includes('lease_end_date'), 'sequence personalization loads the supported lease-end field');
ok(messageQueue.includes('unresolved_tokens: rendered.unresolvedTokens'), 'queue preserves unresolved-token state for launch guards');
ok(sequenceEditor.includes('SEQUENCE_TEMPLATE_TOKENS.map'), 'sequence editor token chips share the launch-time allowlist');
ok(sequenceEditor.includes('getUnsupportedSequenceTemplateTokens'), 'sequence editor rejects unsupported custom token fields');
ok(rex.includes("result === 'unsupported'"), 'Rex bulk text stops safely when desktop SMS is unsupported');
ok(sequences.includes("result === 'unsupported'"), 'sequence mass text preserves the draft when desktop SMS is unsupported');
ok(legacyDeals.includes('parseGrossInput(form.front_gross)'), 'native legacy deal entry validates decimal gross with the shared parser');
ok(legacyDeals.includes('savingRef.current'), 'native legacy deal entry blocks duplicate rapid saves');
ok(!legacyContacts.includes('recipients.map(c => c.phone).join'), 'native legacy mass text no longer opens an exposed group-message composer');
ok(legacyContacts.includes('await launchSms({'), 'native legacy mass text records each confirmed send honestly');
ok(legacyContacts.includes("replace(/\\{\\{first_name\\}\\}/g"), 'native legacy mass text resolves the first-name template per recipient');
ok(legacyContacts.includes('massTextSendingRef.current'), 'native legacy mass text blocks duplicate rapid starts');
ok(!legacyMore.includes('sms:+1XXXXXXXXXX'), 'native legacy support action no longer targets a placeholder phone number');

ok(dealLogger.includes('parseGrossInput(text)'), 'deal gross uses the decimal-safe parser');
ok(dealLogger.includes('validateDealDraft(d)'), 'deal Save exposes deterministic validation');
ok(dealLogger.includes('keyboardType="decimal-pad"'), 'gross fields offer a decimal keypad');
ok(dealLogger.includes('accessibilityLabel="Save deal"'), 'deal Save is exposed as a labeled button');
ok(dealDetail.includes('accessibilityLabel="Delete deal"'), 'deal Delete is exposed as a labeled button');
ok(notifications.includes('accessibilityLabel="Close notifications"'), 'notification close is exposed as a labeled button');
ok(notifications.includes('accessibilityLabel={`${n.read ? \'Mark unread\' : \'Mark read\'}: ${n.title}`}'), 'notification read controls are labeled buttons');
ok(contactDetail.includes('accessibilityLabel="Close contact details"'), 'contact details expose a labeled close button');
ok(contactDetail.includes('accessibilityLabel={`${a.label} ${contact.name}`}'), 'contact call, text, email, and note actions are labeled buttons');
ok(contactDetail.includes('accessibilityLabel="Save customer notes"'), 'contact notes expose a labeled save button');
ok(contactDetail.includes('accessibilityLabel="Log a deal"'), 'contact deal action is exposed as a labeled button');
ok(contactDetail.includes("interaction.source === 'sms_action'"), 'contact history distinguishes SMS attempts from confirmed customer touches');
ok(contactDetail.includes("label: 'TEXT · NOT SENT'"), 'contact history labels an unconfirmed text honestly');

const templateOutput = ts.transpileModule(sequenceTemplates, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const templateModule = { exports: {} };
new Function('module', 'exports', templateOutput.outputText)(templateModule, templateModule.exports);
const { renderSequenceTemplate, getUnsupportedSequenceTemplateTokens } = templateModule.exports;
const resolvedTemplate = renderSequenceTemplate(
  'Hi {{first_name}}, this is {{rep_name}} at {{dealer}} about your {{vehicle}}. Lease: {{lease_end}}.',
  { firstName: 'Jordan', repName: 'Taylor', dealer: 'Northside', vehicle: '2025 Atlas', leaseEnd: '2028-06-01' },
);
ok(resolvedTemplate.message === 'Hi Jordan, this is Taylor at Northside about your 2025 Atlas. Lease: 2028-06-01.', 'supported sequence fields resolve to customer-ready copy');
ok(resolvedTemplate.unresolvedTokens.length === 0, 'fully populated sequence copy has no unresolved fields');
const blockedTemplate = renderSequenceTemplate('Hi {{first_name}} from {{rep_name}} about {{product}}', { firstName: 'Jordan' });
ok(blockedTemplate.unresolvedTokens.join(',') === 'rep_name,product', 'missing and unknown sequence fields are reported before launch');
ok(getUnsupportedSequenceTemplateTokens('Hi {{first_name}} {{product}}').join(',') === 'product', 'editor identifies unsupported sequence fields');

console.log();
if (failed) {
  console.error(`❌ ${failed} FAILED (${passed} passed)`);
  process.exit(1);
}
console.log(`✅ ALL PASSED (${passed} checks)`);
