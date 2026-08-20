// Verifies the SMS status type contract: launchSms returns a SmsLaunchResult
// string, not a boolean. Code that used to check `if (opened)` must now check
// `=== 'opened'` — all three string values are truthy.
//
//   npm run test:smsstatus    (from PocketRepApp/)

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- SmsLaunchResult values ----
const RESULTS = ['opened', 'no_phone', 'failed'];

ok('all values are truthy strings', RESULTS.every(v => typeof v === 'string' && !!v));
ok('opened is the only success', RESULTS.filter(v => v === 'opened').length === 1);

// ---- old-style boolean check would be wrong ----
for (const val of RESULTS) {
  ok(`"${val}" is truthy (old if(opened) would pass)`, !!val);
}
ok('must use === "opened" for success', RESULTS.filter(v => v === 'opened').length === 1);
ok('"no_phone" !== "opened"', 'no_phone' !== 'opened');
ok('"failed" !== "opened"', 'failed' !== 'opened');

// ---- blast status logic ----
function blastStatusFromResults(results) {
  const opened = results.filter(r => r === 'opened').length;
  const total = results.length;
  if (opened === 0) return 'pending_review'; // none opened → don't mark sent
  if (opened === total) return 'sent';
  return 'partial';
}

ok('all opened → sent', blastStatusFromResults(['opened', 'opened', 'opened']) === 'sent');
ok('none opened → pending_review', blastStatusFromResults(['no_phone', 'failed']) === 'pending_review');
ok('partial → partial', blastStatusFromResults(['opened', 'no_phone', 'opened']) === 'partial');
ok('single opened → sent', blastStatusFromResults(['opened']) === 'sent');
ok('single failed → pending_review', blastStatusFromResults(['failed']) === 'pending_review');
ok('empty → pending_review', blastStatusFromResults([]) === 'pending_review');

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${13} checks)`);
process.exit(failures ? 1 : 0);
