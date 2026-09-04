// V1 elite UX regression guard — first-session activation, Rex quick capture,
 // Work My Book, safe tags, text queue, immutable history, and Fresh Up branch.
import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
let checks = 0;
const ok = (name, cond) => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const onboarding = read('components/v2/RexOnboarding.tsx');
const soldGuide = read('components/v2/SoldBookGuide.tsx');
const appShell = read('components/v2/AppShell.tsx');
const rexCoach = read('components/v2/RexCoach.tsx');
const contacts = read('components/v2/ContactsTab.tsx');
const contactDetail = read('components/v2/ContactDetail.tsx');
const blast = read('components/v2/BlastSequenceDrafter.tsx');
const workbook = read('components/v2/WorkMyBookSheet.tsx');
const heat = read('components/v2/HeatSheetTab.tsx');
const queue = read('lib/messageQueue.ts');
const interactions = read('lib/v2/interactions.ts');
const historyMigration = read('supabase/migrations/20260904003000_v1_immutable_contact_history.sql');
const sequenceMigration = read('supabase/migrations/20260904000000_v2_canonical_sequence_templates.sql');

console.log('\n--- onboarding is demo-first and generic ---');
ok('onboarding no longer contains Eddie Ponce placeholder', !onboarding.includes('Eddie Ponce'));
ok('onboarding no longer contains Nissan of Omaha placeholder', !onboarding.includes('Nissan of Omaha'));
ok('onboarding captures industry', onboarding.includes('industry'));
ok('automotive remains the default/primary industry', /Automotive|automotive/.test(onboarding));
ok('Rex identity loads the selected industry', read('lib/v2/coachThread.ts').includes("getRepSetting('industry')"));
ok('Rex prompt explicitly overrides automotive examples for non-auto users',
  read('lib/v2/coachBrain.ts').includes('INDUSTRY OVERRIDE') && /never invent vehicles/i.test(read('lib/v2/coachBrain.ts')));
ok('triad planner/executor honor the same industry override',
  read('lib/v2/rexTriad.ts').includes('triadIndustryOverride'));
ok('demo contacts remain part of onboarding', onboarding.includes('Marcus Holloway') && onboarding.includes('Sarah Thompson'));
ok('onboarding explicitly avoids forcing import', /practice|demo/i.test(onboarding) && !/Import my real book/.test(onboarding));

console.log('\n--- tap-first 60-day sold-book activation ---');
ok('SoldBookGuide exists with 60-day framing', soldGuide.includes('BUILD YOUR 60-DAY BOOK'));
ok('guide starts with last month', soldGuide.includes('Start with last month'));
ok('guide supports previous-month wave', soldGuide.includes('previous_month'));
ok('guide captures minimal sold fields', ['Customer name','Phone number','VEHICLE SOLD','SOLD TIMING'].every(x => soldGuide.includes(x)));
ok('guide hands off to Rex', soldGuide.includes('FINISH WITH REX'));
ok('guided entry deduplicates phone numbers', soldGuide.includes('addedPhones.includes(pk)'));
ok('AppShell wires the guide before Rex mission', appShell.includes('<SoldBookGuide') && appShell.includes('finishGuideWithRex'));

console.log('\n--- Rex quick capture turns data into action ---');
ok('Rex supports add_contact action', rexCoach.includes("action.type === 'add_contact'"));
ok('Rex keeps sold-book capture inside the mission', rexCoach.includes('Give me the next sold customer'));
ok('sold Rex captures are marked past-customer', rexCoach.includes('is_past_customer: true'));
ok('Rex action layer keeps sold customers out of active prospect heat by default',
  read('lib/v2/rexActions.ts').includes("pastCustomer ? 'cold' : 'warm'"));
ok('Rex action layer tags sold captures', read('lib/v2/rexActions.ts').includes("pastCustomer ? ['Sold'] : []"));
ok('new contact exposes immediate thank-you action', rexCoach.includes('DRAFT FIRST THANK-YOU'));
ok('new contact exposes Fresh Up enrollment', rexCoach.includes('＋ FRESH UP'));
ok('new contact exposes customer card', rexCoach.includes('OPEN CUSTOMER'));
ok('AppShell drafts first thank-you from real saved contact', appShell.includes('draftFirstThankYou') && appShell.includes('First thank-you'));
ok('AppShell enrolls Rex-created contacts into Fresh Up', appShell.includes('enrollFreshUpFromRex') && appShell.includes('Fresh Up - 14 Day'));

console.log('\n--- Contacts stays book-focused; work moves to Rex Game Plan ---');
ok('Contacts no longer renders START CALL QUEUE launcher', !contacts.includes('START CALL QUEUE'));
ok('Contacts retains explicit CallQueue implementation for Work My Book reuse', contacts.includes('export function CallQueue'));
ok('Contacts filter metadata is stable', contacts.includes('bookMeta'));
ok('Work My Book has paired call and text queues', workbook.includes('CALL QUEUE') && workbook.includes('TEXT QUEUE'));
ok('Work My Book ranks dormant/stalled/sold/lease context', ['Stalled opportunity','Sold ownership touch','Lease timing'].every(x => workbook.includes(x)));
ok('Heat Sheet has Work My Book CTA', heat.includes('Work My Book'));
ok('AppShell wires Work My Book to Heat Sheet', appShell.includes('onOpenGamePlan={() => setWorkBookOpen(true)}'));

console.log('\n--- contact card is safer and cleaner ---');
ok('ContactDetail no longer imports LanguageToggle', !contactDetail.includes("import LanguageToggle"));
ok('existing tag chip tap manages instead of deleting', contactDetail.includes('onPress={() => setTagPickerOpen(true)}'));
ok('tag picker supports explicit REMOVE', contactDetail.includes("'REMOVE'"));
ok('tag picker supports create-new', contactDetail.includes('Create a new tag'));
ok('tag picker has useful presets', ['Sold','Fresh Up','Lease','Referral','Service'].every(x => contactDetail.includes(`'${x}'`)));

console.log('\n--- Text Queue is rep-controlled, never auto-send ---');
ok('user-facing drafter says TEXT QUEUE', blast.includes('TEXT QUEUE'));
ok('drafter says one customer at a time', blast.includes('ONE CUSTOMER AT A TIME'));
ok('drafter states nothing is auto-sent', blast.includes('nothing is auto-sent'));
ok('AppShell Work My Book creates individualized drafts', appShell.includes('Do not repeat one generic message across the list'));

console.log('\n--- automatic holiday nurture stays truth-safe ---');
const nurtureEngine = read('lib/v2/nurtureEngine.ts');
const scheduler = read('supabase/functions/nurture-scheduler/index.ts');
const holidayMigration = read('supabase/migrations/20260904005000_holiday_truth_safe_reference.sql');
ok('client nurture prompt forbids unverified holiday sale claims',
  nurtureEngine.includes('Holiday/calendar timing is verified context') && nurtureEngine.includes('Never claim any of those unless explicit verified context'));
ok('scheduler prompt carries the same holiday truth rail',
  scheduler.includes('Holiday/calendar timing is verified context') && scheduler.includes('Never claim those unless explicit verified rep/customer context'));
ok('Labor Day reference data no longer seeds clearance/best-deal claims',
  holidayMigration.includes('End-of-summer holiday timing only') && !holidayMigration.includes('Model year clearance. Best deals.'));
ok('holiday migration keeps commercial intensity low/none',
  holidayMigration.includes("else 'low'") && holidayMigration.includes("then 'none'"));

console.log('\n--- permanent contact history ---');
ok('interaction type includes game_plan', interactions.includes("'game_plan'"));
const smsTimelineMigration = read('supabase/migrations/20260821_blast_sms_history.sql');
ok('timeline reads the unified contact_timeline view', interactions.includes("from('contact_timeline')"));
ok('contact_timeline includes outbound_sms_actions', smsTimelineMigration.includes('outbound_sms_actions'));
ok('contact_timeline labels SMS history as sms_action', smsTimelineMigration.includes("'sms_action'"));
ok('history migration widens game_plan type safely', historyMigration.includes("'game_plan'"));
ok('history migration blocks owner UPDATE/DELETE by split RLS', historyMigration.includes('interactions_select_own') && historyMigration.includes('interactions_insert_own') && !historyMigration.includes('create policy interactions_update_own'));
ok('SMS payload mutation is trigger-guarded', historyMigration.includes('guard_outbound_sms_history_payload'));
ok('SMS owner has no DELETE policy', !historyMigration.includes('create policy outbound_sms_actions_delete_own'));

console.log('\n--- Fresh Up classification is explicit and durable ---');
ok('sequence migration flags only a classification step', sequenceMigration.includes('requires_classification'));
ok('queue carries requires_classification to UI', queue.includes('requires_classification?: boolean'));
ok('queue recovers pending classifications from storage', queue.includes('loadPendingSequenceClassifications'));
ok('classification choices are explicit values', ['sold','still_shopping','no_response'].every(x => queue.includes(`'${x}'`)));
ok('Sold branches to Sold Customer Ownership', queue.includes("'Sold Customer Ownership'"));
ok('shopping/no-response branch to Unsold Long-Term Follow-Up', queue.includes("'Unsold Long-Term Follow-Up'"));
ok('no model guesses the classification', queue.includes('Human-resolve') && queue.includes('explicit tap'));

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
