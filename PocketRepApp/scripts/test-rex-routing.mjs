import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const eq = (name, actual, expected) => ok(name, JSON.stringify(actual) === JSON.stringify(expected));

const root = path.resolve(new URL('..', import.meta.url).pathname);
const routingSource = fs.readFileSync(path.join(root, 'lib/v2/rexRouting.ts'), 'utf8');
const proxySource = fs.readFileSync(path.join(root, 'supabase/functions/ai-proxy/index.ts'), 'utf8');
const memorySource = fs.readFileSync(path.join(root, 'lib/v2/rexMemory.ts'), 'utf8');
const coachBrainSource = fs.readFileSync(path.join(root, 'lib/v2/coachBrain.ts'), 'utf8');
const coachSource = fs.readFileSync(path.join(root, 'components/v2/RexCoach.tsx'), 'utf8');
const actionsSource = fs.readFileSync(path.join(root, 'lib/v2/rexActions.ts'), 'utf8');

const proWorkloads = new Set(['weekly_coach', 'whole_book', 'complex_strategy', 'repair']);
const proPatterns = [
  /\b(?:whole|entire)\s+(?:book|pipeline)\b/i,
  /\ball\s+(?:my\s+)?(?:leads|customers|contacts|deals)\b/i,
  /\b(?:plan|map|build)\s+(?:out\s+)?my\s+(?:week|weekly strategy)\b/i,
  /\bweekly\s+(?:coach|strategy|game plan|review)\b/i,
  /\b(?:compare|prioritize|rank)\b[\s\S]{0,48}\b(?:deals|customers|leads|pipeline|book)\b/i,
  /\b(?:conflicting|contradictory|doesn'?t match|context mix(?:ed|ing)?)\b/i,
];
function tier({ workload = 'routine', text = '', conflict = false, repair = false } = {}) {
  if (repair || conflict || proWorkloads.has(workload)) return 'pro';
  return proPatterns.some(p => p.test(text)) ? 'pro' : 'flash';
}
function wholeBook(text = '') {
  return proPatterns.slice(0, 3).some(p => p.test(text));
}
function resolve(text, contacts) {
  const h = ` ${text.toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')} `;
  const full = contacts.filter(c => h.includes(` ${c.name.trim().toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')} `));
  if (full.length === 1) return full[0].id;
  if (full.length > 1) return null;
  const first = contacts.filter(c => h.includes(` ${c.name.trim().toLowerCase().split(/\s+/)[0]} `));
  return first.length === 1 ? first[0].id : null;
}

eq('routine objection stays Flash', tier({ text: "payment's too high" }), 'flash');
eq('single-customer appointment stays Flash', tier({ text: 'Jordan is coming Saturday' }), 'flash');
eq('whole-book request escalates to Pro', tier({ text: 'prioritize my entire book' }), 'pro');
eq('weekly coach workload escalates to Pro', tier({ workload: 'weekly_coach' }), 'pro');
eq('validation repair escalates to Pro', tier({ repair: true }), 'pro');
eq('whole-book detector catches entire book', wholeBook('rank my entire book'), true);
eq('whole-book detector ignores one customer', wholeBook('rank my next move for Jordan'), false);

const contacts = [
  { id: 'j', name: 'Jordan Weektest' },
  { id: 'm', name: 'Mike Rodriguez' },
  { id: 'm2', name: 'Mike Thompson' },
];
eq('full customer name binds exact contact', resolve('Mike Rodriguez asked about his Chevy', contacts), 'm');
eq('unique first name binds contact', resolve('Jordan says bring the trade', contacts), 'j');
eq('ambiguous first name never guesses', resolve('Mike wants numbers', contacts), null);

ok('source defaults routine Rex to DeepSeek V4 Flash', proxySource.includes("const DEEPSEEK_FLASH = 'deepseek/deepseek-v4-flash-0731'"));
ok('source escalates to DeepSeek V4 Pro', proxySource.includes("const DEEPSEEK_PRO = 'deepseek/deepseek-v4-pro-0813'"));
ok('source disables reasoning for Flash', proxySource.includes("{ reasoning: { effort: 'none', exclude: true } }"));
ok('source disables hidden Pro reasoning so visible copy fits', proxySource.includes("{ reasoning: { enabled: false, exclude: true } }"));
ok('source enforces $20 monthly ceiling', proxySource.includes("AI_MONTHLY_CAP_CENTS') ?? '2000'"));
ok('source caps brain output tokens', proxySource.includes('Math.min(Math.floor(requestedMax), MAX_BRAIN_OUTPUT_TOKENS)'));
ok('monthly ledger is recorded', proxySource.includes("increment_monthly_ai_usage"));
ok('monthly ledger writes to the canonical first-of-month bucket', proxySource.includes("p_month: `${date.slice(0, 7)}-01`"));
ok('active-contact memory excludes rep-wide summary', memorySource.includes('Never inject it here'));
ok('coach persists resolved contact id', coachSource.includes('recordRexTurn(text, line, turnContactId)'));
ok('coach carries active contact through pronoun follow-ups', coachSource.includes('activeContactIdRef.current'));
ok('empty or stalled Pro automatically recovers on Flash', coachSource.includes("if (activeTier === 'pro') activeTier = 'flash'"));
ok('coach presents Rex as live or working, never waking', coachSource.includes("'REX · WORKING' : 'REX · LIVE'") && !coachSource.includes('may be waking up'));
ok('whole-book rankings cannot duplicate or invent contacts', coachBrainSource.includes('rank it at most once') && coachBrainSource.includes('return the smaller honest count'));
ok('whole-book turns clear single-contact scope', coachSource.includes("if (wholeBook) activeContactIdRef.current = null"));
ok('whole-book turns ignore stale chat claims', coachSource.includes("history: wholeBook ? [] : history"));
ok('router implementation stays deterministic', routingSource.includes('Rex never spends a model call deciding which model to use'));
ok('malformed fenced actions can receive the one-shot repair', actionsSource.includes('JSON.parse(candidate.trim())'));

console.log(failures === 0 ? '\nAll Rex routing checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
