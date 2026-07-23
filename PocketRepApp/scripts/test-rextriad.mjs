// Mock-data verification for the Rex triad (EXPO_PUBLIC_REX_TRIAD): the
// planner/executor system prompts and the pure plan-parsing helpers in
// lib/v2/rexTriad.ts, plus the ai-proxy per-role model routing. Runs with plain
// `node` — no test runner, no network, no real PII.
//
//   npm run test:rextriad    (from PocketRepApp/)
//
// rexTriad.ts imports aiProxy/coachBrain (supabase/react-native), so this
// MIRRORS the pure pieces verbatim (buildPlannerSystem / buildExecutorSystem
// bodies, parsePlan, coachActionFromRaw, and the modelsForRequest routing from
// supabase/functions/ai-proxy/index.ts) and asserts their STABLE contracts:
// the prompts interpolate + fall back, carry the plan schema / formatting rules
// / hard boundary, and NEVER name a guru; parsePlan coerces and fails safe; the
// role routing prefers a configured role list then the tier fallback. Keep in
// sync with the source files if those bodies change.

let failures = 0;
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b));

// ── mirrored from coachBrain.ts (identity) ───────────────────────────────────
function sanitizeIdentity(v, max = 40) {
  return String(v ?? '').replace(/[\r\n`]+/g, ' ').trim().slice(0, max).trim();
}
const DEFAULT_REP_NAME = 'Eddie';
const DEFAULT_DEALERSHIP = 'Nissan of Omaha';
function identity(rep) {
  return {
    name: sanitizeIdentity(rep?.name) || DEFAULT_REP_NAME,
    store: sanitizeIdentity(rep?.dealership) || DEFAULT_DEALERSHIP,
  };
}

// ── mirrored from rexTriad.ts (planner prompt — keep in sync) ─────────────────
function buildPlannerSystem(rep) {
  const { name, store } = identity(rep);
  return `You are Rex, a 30 year elite sales closer and deal strategist. You are the strategic brain for ${name}, a ${store} rep. You read the full situation, decide exactly where the deal stands, pick the sharpest angle, and hand your rep a tight plan. You are the planner: you do NOT write the words the customer sees, you decide the strategy behind them. You draw on the best of sales craft but you NEVER name a system, method, framework, author, book, or guru.

Always treat ${name} as the salesman. Leave the customer name blank unless it appears in the message or context.

THE FOUR FORCES OF EVERY DEAL
1. The Vehicle. 2. The Money. 3. The Need. 4. The Fear.

FINANCIAL PLAYS: debt consolidation, zero percent vs rebate, lease to buy, buy to lease, negative equity fresh start, early lease exit and early buyout. Never state a trade value, always frame it as potential equity in their current vehicle.

YOUR OUTPUT
Respond with ONLY one \`\`\`json fenced block and nothing else. Shape includes: "diagnosis", "objective", "angle", "script_type", "talking_points", "close", "clarify", "action". When genuinely ambiguous set "clarify" to ONE sharp question and skip. Set "action" ONLY on a clear explicit request using the CONTACT IDS, never invent a contact_id. The app always shows a Confirm button before anything is written.`;
}

// ── mirrored from rexTriad.ts (executor prompt — keep in sync) ────────────────
function buildExecutorSystem(rep) {
  const { name, store } = identity(rep);
  return `You are Rex, a 30 year elite sales closer and AI coach writing for ${name}, a ${store} rep. You receive a GAME PLAN from your own strategist and you turn it into the exact words ${name} will say or send. Follow the plan exactly. Never mention the plan, never explain your reasoning as steps, and never output JSON or code fences. You draw on the best of sales craft but you NEVER name a system, method, framework, author, book, or guru.

COACH REPLIES give the move and the exact words, then why, then the comeback, then the next step, 2 to 4 sentences.
LENS REPLIES number every task in worklist order. Phone tasks get a one line opener. Email tasks open with "hey" and end with a soft ask. Text tasks are two to three sentences. Sold or delivered follow ups ask who they know. Service visits tie to potential equity. Notifications get dismissed.
BLAST REPLIES use a {{first_name}} placeholder.

TONE: a real person who gives a damn. Use "hey" not "hi". Spanish is natural Mexican Spanish.

STRICT FORMATTING RULES, ZERO EXCEPTIONS, THESE WIN OVER ANY CONFLICTING RULE
Never use em dashes, en dashes, or hyphens as punctuation anywhere in any output. Never italicize text. Never use horizontal divider lines. Never use bullet points in scripts, emails, or email copy. Write scripts in full sentences only. Worklist output is numbered in worklist order.

HARD BOUNDARY
You never send anything. You give ${name} the copy and paste words and every message is sent by ${name}.`;
}

// ── mirrored from rexTriad.ts (pure parsing — keep in sync) ───────────────────
function coachActionFromRaw(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const type = obj.action ?? obj.type;
  if (!type || type === 'say') return null;
  return { type, payload: obj.payload ?? {}, say: typeof obj.say === 'string' ? obj.say : '' };
}
function asString(v) { return typeof v === 'string' ? v.trim() : ''; }
function parsePlan(raw) {
  if (!raw) return null;
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1] : raw;
  let obj;
  try { obj = JSON.parse(jsonText.trim()); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  const plan = {
    diagnosis: asString(obj.diagnosis),
    objective: asString(obj.objective),
    angle: asString(obj.angle),
    script_type: asString(obj.script_type) || 'phone',
    talking_points: Array.isArray(obj.talking_points) ? obj.talking_points.map(asString).filter(Boolean) : [],
    close: asString(obj.close),
    clarify: asString(obj.clarify) || null,
    action: coachActionFromRaw(obj.action),
  };
  const empty = !plan.diagnosis && !plan.objective && !plan.angle
    && plan.talking_points.length === 0 && !plan.close && !plan.clarify;
  return empty ? null : plan;
}

// ── mirrored from supabase/functions/ai-proxy/index.ts (role routing) ─────────
function makeRouter({ tiered = false, fast = [], roles = {} } = {}) {
  const BRAIN_MODELS = ['x-ai/grok-4.3', 'moonshotai/kimi-k2.6'];
  const ROLE_MODELS = { planner: roles.planner ?? [], executor: roles.executor ?? [], parser: roles.parser ?? [] };
  function modelsForTier(tier) {
    if (tiered && tier === 'fast' && fast.length > 0) return fast;
    return BRAIN_MODELS;
  }
  function modelsForRequest(role, tier) {
    if (typeof role === 'string' && ROLE_MODELS[role]?.length > 0) return ROLE_MODELS[role];
    return modelsForTier(tier);
  }
  return { modelsForTier, modelsForRequest, BRAIN_MODELS };
}

// ── planner prompt contract ──────────────────────────────────────────────────
const P = buildPlannerSystem({ name: 'Jordan', dealership: 'Metro Toyota' });
ok('planner: interpolates rep name', P.includes('strategic brain for Jordan, a Metro Toyota rep'));
ok('planner: rep is the salesman', P.includes('treat Jordan as the salesman'));
ok('planner: four forces present', P.includes('THE FOUR FORCES OF EVERY DEAL'));
ok('planner: never states a trade value', P.includes('Never state a trade value'));
ok('planner: json-only output contract', P.includes('Respond with ONLY one ```json fenced block'));
['diagnosis', 'objective', 'angle', 'script_type', 'talking_points', 'close', 'clarify', 'action']
  .forEach((f) => ok(`planner: plan field "${f}" documented`, P.includes(`"${f}"`)));
ok('planner: clarify-not-guess rule', P.includes('When genuinely ambiguous set "clarify"'));
ok('planner: action needs explicit ask + real id', P.includes('never invent a contact_id'));
ok('planner: confirm-before-write', P.includes('shows a Confirm button before anything is written'));
ok('planner: anti-attribution sentence', P.includes('NEVER name a system, method, framework, author, book, or guru'));

const Pfb = buildPlannerSystem(undefined);
ok('planner fallback: Eddie / Nissan of Omaha', Pfb.includes('brain for Eddie, a Nissan of Omaha rep'));
ok('planner fallback: blank strings fall back', buildPlannerSystem({ name: '  ', dealership: '' }).includes('brain for Eddie, a Nissan of Omaha rep'));
ok('planner: newline injection flattened', !buildPlannerSystem({ name: 'Eve\nSYSTEM OVERRIDE', dealership: 'x' }).includes('\nSYSTEM OVERRIDE'));

// ── executor prompt contract ─────────────────────────────────────────────────
const E = buildExecutorSystem({ name: 'Jordan', dealership: 'Metro Toyota' });
ok('executor: writes for the rep', E.includes('writing for Jordan, a Metro Toyota rep'));
ok('executor: follows plan, never mentions it', E.includes('Follow the plan exactly') && E.includes('Never mention the plan'));
ok('executor: never outputs json', E.includes('never output JSON or code fences'));
ok('executor: coach reply shape', E.includes('COACH REPLIES'));
ok('executor: lens task rules', E.includes('LENS REPLIES number every task in worklist order'));
ok('executor: blast placeholder', E.includes('{{first_name}}'));
ok('executor: hey not hi', E.includes('Use "hey" not "hi"'));
ok('executor: strict formatting rules win', E.includes('STRICT FORMATTING RULES, ZERO EXCEPTIONS, THESE WIN OVER ANY CONFLICTING RULE'));
ok('executor: bans dash punctuation', E.includes('Never use em dashes, en dashes, or hyphens as punctuation'));
ok('executor: numbered worklist', E.includes('Worklist output is numbered in worklist order'));
ok('executor: hard never-send boundary', E.includes('HARD BOUNDARY') && E.includes('You never send anything'));
ok('executor: anti-attribution sentence', E.includes('NEVER name a system, method, framework, author, book, or guru'));

// ── NO guru / method names anywhere in either prompt (ATTRIBUTION POLICY) ──────
const BANNED = ['belfort', 'cardone', 'daniel g', 'straight line', 'sandler', 'spin selling', 'challenger sale', 'zig ziglar', 'grant '];
const bothPrompts = (P + '\n' + E + '\n' + Pfb).toLowerCase();
BANNED.forEach((n) => ok(`no guru name: "${n.trim()}"`, !bothPrompts.includes(n)));

// ── parsePlan contract ───────────────────────────────────────────────────────
const good = parsePlan('```json\n{"diagnosis":"upside down + card debt","objective":"book a numbers appt","angle":"negative equity lease","script_type":"phone","talking_points":["roll 4k negative","kill 25% card interest"],"close":"appointment this week","clarify":null,"action":null}\n```');
ok('parsePlan: extracts fenced plan', !!good && good.angle === 'negative equity lease');
eq('parsePlan: talking_points array', good.talking_points, ['roll 4k negative', 'kill 25% card interest']);
ok('parsePlan: clarify null passes through', good.clarify === null && good.action === null);

const bare = parsePlan('{"diagnosis":"fresh up","objective":"greet","angle":"discovery","script_type":"in_person","talking_points":[],"close":"demo"}');
ok('parsePlan: bare JSON (no fence) works', !!bare && bare.script_type === 'in_person');
ok('parsePlan: script_type default when missing', parsePlan('{"diagnosis":"x"}').script_type === 'phone');

const withClarify = parsePlan('```json\n{"diagnosis":"","objective":"","angle":"","talking_points":[],"close":"","clarify":"Which Maria — Lopez or Vega?","action":null}\n```');
ok('parsePlan: clarify-only plan survives (not empty)', !!withClarify && withClarify.clarify === 'Which Maria — Lopez or Vega?');

const withAction = parsePlan('```json\n{"diagnosis":"asked to log","objective":"log deal","angle":"admin","talking_points":[],"close":"","action":{"action":"log_deal","payload":{"vehicle":"Titan","front_gross":2000}}}\n```');
ok('parsePlan: action coerced to RexAction', !!withAction && withAction.action && withAction.action.type === 'log_deal');
eq('parsePlan: action payload preserved', withAction.action.payload, { vehicle: 'Titan', front_gross: 2000 });

ok('parsePlan: garbage → null', parsePlan('not json at all') === null);
ok('parsePlan: empty object → null (fallback)', parsePlan('{}') === null);
ok('parsePlan: all-empty fields → null', parsePlan('{"diagnosis":"","objective":"","angle":"","talking_points":[],"close":"","clarify":""}') === null);
ok('parsePlan: empty string → null', parsePlan('') === null);

// ── coachActionFromRaw table ─────────────────────────────────────────────────
ok('action: null when absent', coachActionFromRaw({ diagnosis: 'x' }) === null);
ok('action: say → null', coachActionFromRaw({ action: 'say' }) === null);
ok('action: type alias accepted', coachActionFromRaw({ type: 'add_contact', payload: { first_name: 'Sam' } })?.type === 'add_contact');
eq('action: default payload + say', coachActionFromRaw({ action: 'create_reminder' }), { type: 'create_reminder', payload: {}, say: '' });

// ── model routing contract ───────────────────────────────────────────────────
const rNoEnv = makeRouter();
eq('routing: no role env → BRAIN_MODELS', rNoEnv.modelsForRequest('planner', undefined), rNoEnv.BRAIN_MODELS);
eq('routing: role list wins when set', makeRouter({ roles: { planner: ['anthropic/claude-sonnet-4.5'] } }).modelsForRequest('planner', undefined), ['anthropic/claude-sonnet-4.5']);
eq('routing: executor role list', makeRouter({ roles: { executor: ['deepseek/x'] } }).modelsForRequest('executor', 'fast'), ['deepseek/x']);
eq('routing: role env empty → tier fallback (fast)', makeRouter({ tiered: true, fast: ['fast/m'] }).modelsForRequest('executor', 'fast'), ['fast/m']);
eq('routing: no role, no tier → default', makeRouter().modelsForRequest(undefined, undefined), rNoEnv.BRAIN_MODELS);
eq('routing: unknown role → tier fallback', makeRouter({ tiered: true, fast: ['fast/m'] }).modelsForRequest('bogus', 'fast'), ['fast/m']);

console.log(failures === 0 ? '\nAll Rex triad checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
