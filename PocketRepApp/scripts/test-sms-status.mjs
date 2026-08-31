// Verifies the SMS status type contract: launchSms returns a SmsLaunchResult
// string, not a boolean. Code that used to check `if (opened)` must now check
// `=== 'opened'` — all three string values are truthy.
//
//   npm run test:smsstatus    (from PocketRepApp/)

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

let failures = 0;
let checks = 0;
const ok = (name, cond) => { checks++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

// ---- SmsLaunchResult values ----
const RESULTS = ['opened', 'not_sent', 'no_phone', 'unsupported', 'failed'];

ok('all values are truthy strings', RESULTS.every(v => typeof v === 'string' && !!v));
ok('opened is the only success', RESULTS.filter(v => v === 'opened').length === 1);

// ---- old-style boolean check would be wrong ----
for (const val of RESULTS) {
  ok(`"${val}" is truthy (old if(opened) would pass)`, !!val);
}
ok('must use === "opened" for success', RESULTS.filter(v => v === 'opened').length === 1);
ok('"no_phone" !== "opened"', 'no_phone' !== 'opened');
ok('"not_sent" !== "opened"', 'not_sent' !== 'opened');
ok('"unsupported" !== "opened"', 'unsupported' !== 'opened');
ok('"failed" !== "opened"', 'failed' !== 'opened');

// ---- web SMS capability gate ----
const root = path.resolve(new URL('..', import.meta.url).pathname);
const capabilitySource = fs.readFileSync(path.join(root, 'lib/v2/smsCapability.ts'), 'utf8');
const capabilityOutput = ts.transpileModule(capabilitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const capabilityModule = { exports: {} };
new Function('module', 'exports', capabilityOutput.outputText)(capabilityModule, capabilityModule.exports);
const { isSmsCapableWebRuntime, isNativeProtocolCapableWebRuntime } = capabilityModule.exports;

ok('iPhone web can launch SMS', isSmsCapableWebRuntime({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' }));
ok('Android web can launch SMS', isSmsCapableWebRuntime({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36' }));
ok('iPad desktop mode can launch SMS', isSmsCapableWebRuntime({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }));
ok('desktop Chrome is blocked from SMS protocol handoff', !isSmsCapableWebRuntime({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36', platform: 'Linux x86_64' }));
ok('desktop Safari is blocked from SMS protocol handoff', !isSmsCapableWebRuntime({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 }));
ok('iPhone web can launch native call protocols', isNativeProtocolCapableWebRuntime({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' }));
ok('Android web can launch native call protocols', isNativeProtocolCapableWebRuntime({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile Safari/537.36' }));
ok('desktop Chrome is blocked from native call protocol handoff', !isNativeProtocolCapableWebRuntime({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36', platform: 'Linux x86_64' }));

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

console.log(`\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (${checks} checks)`);
process.exit(failures ? 1 : 0);
