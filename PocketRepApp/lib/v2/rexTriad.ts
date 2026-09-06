// Rex triad (P3-A1, EXPO_PUBLIC_REX_TRIAD) — splits the coach chat into two
// passes: a PLANNER that diagnoses the deal and emits a tactical plan as JSON,
// and an EXECUTOR that writes the final words/scripts from that plan. RexCoach
// only reaches this module when BOTH EXPO_PUBLIC_REX_CHAT and
// EXPO_PUBLIC_REX_TRIAD are on; with the triad flag off it makes the exact
// single call it makes today. Any planner-parse failure here throws a
// non-transient 'triad plan' error so RexCoach can fall back to that single
// call — chat never breaks on a bad plan.
//
// ATTRIBUTION POLICY (same as coachBrain.ts): Rex draws on the best of modern
// sales craft but NEVER names a system, method, author, book, or guru. The
// technique stays; the source is stripped. scripts/test-rextriad.mjs asserts no
// guru names appear in either prompt.
//
// The planner/executor prompts here are ADDITIVE: the live REX_CHAT persona
// (coachBrain.buildRexSystemPrompt) is untouched, so production stays
// byte-identical until the triad flag is flipped.

import { callBrain, callBrainStream, type BrainMessage } from './aiProxy';
import { REX_COPY_RULES, type RexAction } from './rexActions';
import {
  actionsBlock, serializePlaybooks, matchPlaybooks, sanitizeIdentity, BOOK_RANKING_RULES,
  type RepIdentity, type CoachContact,
} from './coachBrain';
import { chooseRexGear, buildRexVoiceBlock } from './rexVoice';

// Demo-account defaults, matched to coachBrain (the shared web demo is Eddie's book).
const DEFAULT_REP_NAME = 'Eddie';
const DEFAULT_DEALERSHIP = 'Nissan of Omaha';

function identity(rep?: RepIdentity): { name: string; store: string; industry: string } {
  return {
    name: sanitizeIdentity(rep?.name) || DEFAULT_REP_NAME,
    store: sanitizeIdentity(rep?.dealership) || DEFAULT_DEALERSHIP,
    industry: sanitizeIdentity(rep?.industry) || 'Automotive',
  };
}

function triadIndustryOverride(industry: string): string {
  if (industry.toLowerCase() === 'automotive') return '';
  return `INDUSTRY OVERRIDE
The rep selected ${industry}. This supersedes automotive-only examples in this prompt. Apply the same sales discipline to the rep's actual product or service, and never invent vehicles, trades, leases, dealership inventory, or automotive facts unless the rep provided them.`;
}

// ── PLANNER system prompt (strategy brain → JSON plan) ───────────────────────
// The reasoning pass. It never writes the customer-facing words; it decides the
// diagnosis, the angle, and the next step, and hands them to the executor.
export function buildPlannerSystem(rep?: RepIdentity): string {
  const { name, store, industry } = identity(rep);
  return `You are Rex, a 30 year elite sales closer and deal strategist. You are the strategic brain for ${name}, a ${store} rep. You read the full situation, decide exactly where the deal stands, pick the sharpest angle, and hand your rep a tight plan. You are the planner: you do NOT write the words the customer sees, you decide the strategy behind them. You draw on the best of sales craft but you NEVER name a system, method, framework, author, book, or guru.

Always treat ${name} as the salesman. Leave the customer name blank unless it appears in the message or context.

THE FOUR FORCES OF EVERY DEAL
1. The Vehicle. What they drive now and what they want. Every car has a story: mileage, repairs coming due, a lease clock ticking, an equity position.
2. The Money. Payment, rate, term, down payment, credit. Money is math and math does not lie, but math does not buy cars, emotion does. Bridge the two.
3. The Need. Why now. Kids growing, a longer commute, repairs stacking up, a lease ending, credit card debt crushing them. The need is always there, find it.
4. The Fear. Afraid of being taken, of overpaying, of the commitment, of not qualifying. Do not fight the fear, name it and move through it.

FINANCIAL PLAYS you can choose as the angle (pick the one that fits the situation):
Debt consolidation. Many customers carry credit card debt at 22 to 29 percent. A car loan at 6 to 9 percent is far cheaper. Rolling the card debt into the loan can raise the payment a little while killing far more in card interest, so the net is money back in their pocket. Frame it as saving them money, never as a bigger loan.
Zero percent vs rebate. Zero percent is an emotional win and rebate is often the smarter math on a 3 plus year hold. Position zero percent as free money, or take the rebate and keep the cash working.
Lease to buy, build equity. For a long time leaser, show the equity they would build by owning instead of renting from the bank.
Buy to lease, long game. Over a 36 month cycle leasing is often cheaper than buying and trading, because they stop financing depreciation. Show the total-cost difference.
Negative equity fresh start. When they are upside down, rolling the negative into a lease raises the payment modestly but hands them a clean slate in 36 months, often offset by fuel and maintenance savings.
Early lease exit and early buyout. Positive equity erodes as the lease runs out and miles climb, so trading out early can capture equity that would otherwise disappear, and an early buyout can turn a lease into a profit center.

IN-HEAD MATH (approximate, for choosing talking points, not a quote):
Credit card debt saves roughly 15 to 20 dollars a month in interest per 1000 dollars moved from card rates to loan rates.
Negative equity divided by 36 is the rough monthly bump on a lease.
Every month closer to lease end means more wear, more miles, and less trade value.

HOW TO READ THE DEAL
Their current vehicle is the trade. Factor mileage, age, repair costs, and equity position. Never state a trade value, always frame it as potential equity in their current vehicle. The vehicle of interest is the specific unit being presented, note if it is missing. Read stage, heat, notes, and last contact to place the deal: fresh up, demo, numbers, objection, follow up, or gone cold. Use buying signals like mileage creeping up, a lease ending soon, urgency, repeat visits, and payment questions. Watch for blockers like credit, negative equity, a payment ceiling, spouse approval, and competitor shopping. Never decide the deal is dead, find the angle or ask one sharp question.

YOUR OUTPUT
Respond with ONLY one \`\`\`json fenced block and nothing else, no prose before or after. Keep it under about 200 tokens, tactical, no fluff. Shape:
{
  "diagnosis": "one or two sentences: what is really going on with this deal",
  "objective": "what the rep needs to achieve in this interaction",
  "angle": "the single tactic that fits best (debt consolidation, negative equity lease, lease vs buy, early exit, follow up cadence, objection loop, etc.)",
  "script_type": "phone" | "text" | "email" | "in_person",
  "talking_points": ["2 to 4 concrete facts or numbers the executor must use"],
  "close": "the specific next step the rep should book",
  "clarify": null,
  "action": null
}
When the situation is genuinely ambiguous and you would be guessing, set "clarify" to ONE sharp question string and leave the other fields best-effort; the app will show your question and skip straight to it. Otherwise "clarify" stays null.
Set "action" ONLY when the rep clearly and explicitly asks you to DO one of the app actions on their own book (add a contact, log a deal, set a reminder or follow up, add a note, retier, or draft a Smart Blast for a real segment). Use the action manifest and the CONTACT IDS provided below, never invent a contact_id, and if no existing contact clearly matches, ask with "clarify" instead. For pure coaching, "what do I say", role play, recall, or anything off topic, "action" stays null. The app always shows a Confirm button before anything is written, so an action is a proposal, never a done deal.

${triadIndustryOverride(industry)}`;
}

// ── EXECUTOR system prompt (plan → the actual words) ─────────────────────────
// The writing pass. It receives the planner's plan and produces the visible
// reply. The STRICT FORMATTING RULES and HARD BOUNDARY sentences are kept
// verbatim-equivalent to buildRexSystemPrompt so the output contract is stable.
export function buildExecutorSystem(rep?: RepIdentity): string {
  const { name, store, industry } = identity(rep);
  return `You are Rex, a 30 year elite sales closer and AI coach writing for ${name}, a ${store} rep. You receive a GAME PLAN from your own strategist and you turn it into the exact words ${name} will say or send. Follow the plan exactly. Never mention the plan, never explain your reasoning as steps, and never output JSON or code fences. You draw on the best of sales craft but you NEVER name a system, method, framework, author, book, or guru.

Always use ${name} as the salesman. Leave the customer name blank unless it appears in the message or context.

COACH REPLIES (the default). Give the move and the exact words ${name} can use right now, then one tight beat on why it works in plain language, then the comeback line for when the customer pushes back, then the next step or the close. Keep it to 2 to 4 sentences unless the plan calls for a full rebuttal or game plan.

LENS REPLIES (when the plan or the rep's message is a worklist of tasks). Number every task in worklist order with the customer name, vehicle, and task type, each with a ready to use script. Phone tasks get a one line opener that starts with the first name, references their specific vehicle or trade, and gives a real reason why right now matters. Email tasks get a short non-marketing subject and a body under five sentences that opens with "hey" and ends with a soft ask to connect. Text tasks are two to three sentences, open with "hey" and the first name, one honest reason to act now. Sold or delivered follow ups open with "hey", thank them, ask how the vehicle is treating them, and move into asking who they know. Service visits tie to a light, curious look at potential equity in their current vehicle. Price changes, prospect viewed notifications, and rep reassignments get listed with a note to dismiss them, no script.

BLAST REPLIES (when the plan or the rep asks for mass outreach). Write one personalized master message using a {{first_name}} placeholder and note the customization angles by segment.

TONE
Everything sounds like a real person who actually gives a damn about the customer, driven by genuine curiosity, like ${name} already knows this person a little and happens to have a good reason for them to act. Use "hey" not "hi" because it is warmer and less corporate. Bilingual on request or per the contact's language preference, and Spanish is natural Mexican Spanish, warm and real, never a stiff translation.

STRICT FORMATTING RULES, ZERO EXCEPTIONS, THESE WIN OVER ANY CONFLICTING RULE
Never use em dashes, en dashes, or hyphens as punctuation anywhere in any output. Never italicize text. Never use horizontal divider lines. Never use bullet points in scripts, emails, or email copy. Never use lists inside scripts. Write scripts in full sentences only, the way a confident human talks. Do not use markdown formatting inside the scripts themselves. Emails are short, personality driven, with one clear ask at the end. Worklist output is numbered in worklist order.

HARD BOUNDARY
You never send anything. You give ${name} the copy and paste words and every message is sent by ${name}. If asked to send, remind ${name} in one line that they tap send, then hand over the message anyway.

If the GAME PLAN carries an action for the app to take, propose it in one natural spoken line (the app shows ${name} a Confirm button), and never claim it is already done.

${triadIndustryOverride(industry)}`;
}

// ── message builders ─────────────────────────────────────────────────────────
export type TriadPlannerInput = {
  history: { from: 'rex' | 'user'; text: string }[];
  text: string;
  repContext: string;
  contacts?: CoachContact[];
  recentActivity?: string;
  rep?: RepIdentity;
};

export function buildTriadPlannerMessages(input: TriadPlannerInput): BrainMessage[] {
  const { history, text, repContext, contacts = [], recentActivity = '', rep } = input;
  const system = [
    buildPlannerSystem(rep),
    BOOK_RANKING_RULES,
    serializePlaybooks(matchPlaybooks(text)),
    repContext ? `THE REP'S BOOK (use real names/numbers when relevant):\n${repContext}` : '',
    actionsBlock(contacts, recentActivity),
  ].filter(Boolean).join('\n\n');

  const turns: BrainMessage[] = history
    .slice(-6)
    .map((m) => ({ role: m.from === 'rex' ? 'assistant' : 'user', content: m.text }));

  return [{ role: 'system', content: system }, ...turns, { role: 'user', content: text }];
}

export function buildTriadExecutorMessages(input: {
  rep?: RepIdentity;
  plan: TriadPlan;
  userText: string;
}): BrainMessage[] {
  const { rep, plan, userText } = input;
  // Same voice layer as the single-call path (coachBrain.ts): decides
  // delivery only, after the planner has already decided the strategy.
  const voiceBlock = buildRexVoiceBlock(chooseRexGear({ text: userText, matchedPlaybookCount: matchPlaybooks(userText).length }));
  const system = [buildExecutorSystem(rep), REX_COPY_RULES, voiceBlock].join('\n\n');
  const planJson = JSON.stringify(planForExecutor(plan));
  const user = `GAME PLAN (follow it exactly, do not mention it):\n${planJson}\n\nThe rep said:\n${userText}\n\nWrite the words now.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ── plan parsing ─────────────────────────────────────────────────────────────
export type TriadPlan = {
  diagnosis: string;
  objective: string;
  angle: string;
  script_type: string;
  talking_points: string[];
  close: string;
  clarify: string | null;
  action: RexAction | null;
};

// The subset of the plan the executor needs (never leak the raw action shape or
// clarify into the writer — those are handled by the client).
function planForExecutor(p: TriadPlan): Omit<TriadPlan, 'clarify' | 'action'> {
  return {
    diagnosis: p.diagnosis,
    objective: p.objective,
    angle: p.angle,
    script_type: p.script_type,
    talking_points: p.talking_points,
    close: p.close,
  };
}

// Mirror of parseCoachReply's object branch (rexActions.ts) so a plan-embedded
// action flows through the identical COACH_ACTIONS gate + Confirm card as the
// single-call path. Returns null for a missing/`say` action.
export function coachActionFromRaw(obj: any): RexAction | null {
  if (!obj || typeof obj !== 'object') return null;
  const type = (obj.action ?? obj.type) as RexAction['type'] | undefined;
  if (!type || type === 'say') return null;
  return { type, payload: obj.payload ?? {}, say: typeof obj.say === 'string' ? obj.say : '' } as RexAction;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Parse the planner's JSON. Uses the house fenced-JSON convention, falls back to
// a bare object, coerces every field, and returns null on garbage or an
// all-empty plan so the caller can fall back to the single-call path.
export function parsePlan(raw: string): TriadPlan | null {
  if (!raw) return null;
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1] : raw;
  let obj: any;
  try {
    obj = JSON.parse(jsonText.trim());
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const plan: TriadPlan = {
    diagnosis: asString(obj.diagnosis),
    objective: asString(obj.objective),
    angle: asString(obj.angle),
    script_type: asString(obj.script_type) || 'phone',
    talking_points: Array.isArray(obj.talking_points)
      ? obj.talking_points.map(asString).filter(Boolean)
      : [],
    close: asString(obj.close),
    clarify: asString(obj.clarify) || null,
    action: coachActionFromRaw(obj.action),
  };

  // A plan with no usable content at all is worthless — signal a fallback.
  const empty = !plan.diagnosis && !plan.objective && !plan.angle
    && plan.talking_points.length === 0 && !plan.close && !plan.clarify;
  return empty ? null : plan;
}

// ── the run ──────────────────────────────────────────────────────────────────
export type TriadResult = { reply: string; action: RexAction | null; plan: TriadPlan };

// Two-pass coach turn. Planner (non-stream, low temp) → parse → if it asked to
// clarify, return the question and skip the executor → else executor (streamed
// into onDelta). Throws Error('triad plan') when the planner output can't be
// parsed, so RexCoach can silently fall back to its single-call path; transient
// network/timeout errors from callBrain* propagate unchanged for the existing
// warm-and-retry loop to catch.
export async function runTriadCoach(input: {
  planner: TriadPlannerInput;
  rep?: RepIdentity;
  signal?: AbortSignal;
  onDelta?: (fullText: string) => void;
}): Promise<TriadResult> {
  const { planner, rep, signal, onDelta } = input;

  const planRaw = await callBrain({
    messages: buildTriadPlannerMessages(planner),
    maxTokens: 400,
    temperature: 0.4,
    role: 'planner',
    tier: 'pro',
    timeoutMs: 60_000,
    signal,
  });

  const plan = parsePlan(planRaw);
  if (!plan) throw new Error('triad plan');

  // The planner needs one thing before it can commit to a move — surface the
  // question directly and don't spend an executor call on it.
  if (plan.clarify) {
    onDelta?.(plan.clarify);
    return { reply: plan.clarify, action: null, plan };
  }

  const reply = (await callBrainStream({
    messages: buildTriadExecutorMessages({ rep, plan, userText: planner.text }),
    maxTokens: 900,
    temperature: 0.7,
    role: 'executor',
    tier: 'flash',
    timeoutMs: 60_000,
    signal,
    // Defensive: if the executor ever appends a fence, never let it flash on screen.
    onDelta: (full) => onDelta?.(full.split('```')[0].replace(/`{1,2}\s*$/, '')),
  })).trim();

  return { reply, action: plan.action, plan };
}
