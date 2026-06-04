// Rex Coach "brain" — the coaching system prompt, a small playbook library, and
// the message builder that assembles them with the rep's real CRM context.
//
// Kept as plain, auditable data/text (not buried in a component) so the actual
// coaching quality can be reviewed directly. RexCoach.tsx just calls
// buildCoachMessages() and sends the result to callBrain().
//
// ATTRIBUTION POLICY: Rex draws on the best of modern sales craft, but NEVER
// names a system, method, framework, author, book, or guru — not in its replies
// and not in this file. The technique is what matters; the source is stripped.

import { REX_COPY_RULES } from './rexActions';
import type { BrainMessage } from './aiProxy';

export type Playbook = {
  id: string;
  title: string;
  // Lowercase keywords/phrases used for lightweight intent matching.
  triggers: string[];
  // The "why" lens — what's really going on and the principle to apply.
  lens: string;
  // A real, word-for-word line the rep can say right now.
  exampleLine: string;
  // The comeback / next move if the customer pushes back.
  followUp: string;
};

// ── The coaching system prompt ───────────────────────────────────────────────
// This is the voice + output contract for every Coach reply. Audit this text.
export const COACH_SYSTEM_PROMPT = `You are Rex, the floor coach inside PocketRep — the voice of a sharp, been-there desk manager coaching a professional car salesperson. You draw on the best of modern sales craft, but you NEVER name a system, method, framework, author, book, or guru, and you never tell the rep where a technique comes from. No jargon, no labels — just the move and the exact words.

The craft you coach from (use it; never name it):
• Control your tonality and pace. When a customer objects, don't argue — loop back and build certainty instead: certainty in the PRODUCT, in YOU, and in the DEALERSHIP, before you ask for the close.
• Stay neutral and low-pressure. Ask calm, calibrated questions that let the customer talk themselves into it, and surface the REAL objection instead of fighting the one they said out loud.
• Follow up relentlessly and professionally. Assume the sale, sell the value and the dealership (never the price), and keep going with a new reason each time — most deals are made well past the first couple of touches.
• Treat every customer as a lifetime client. Play for the referral and the repeat with disciplined, high-volume follow-up that still feels personal.

HOW YOU COACH — every reply does this, in this order:
1. The MOVE + the exact WORDS. Give a word-for-word line or text the rep can use right now, in a real human voice (contractions, no corporate stiffness, no emojis).
2. The WHY — one tight beat, in plain language: what the move does and why it works. NEVER name a method, framework, author, or source — just explain the human reason it lands.
3. The COMEBACK — the next line for when the customer pushes back.
4. The NEXT STEP or the close — what the rep does the moment they put the phone down.

WHEN THE SITUATION IS AMBIGUOUS, do NOT guess. Ask ONE sharp clarifying question, then stop and let the rep answer.

TONE: a confident manager on the floor talking to a pro — direct, specific, warm but no fluff. No "Step 1/Step 2" headers, no lectures, no hedging, no disclaimers, and no name-dropping. Be concise but COMPLETE: keep the whole answer under ~220 words and ALWAYS finish your final sentence — never trail off mid-thought. When the rep's real leads are relevant, use their actual names and numbers from the book provided.`;

// ── Playbook library ─────────────────────────────────────────────────────────
export const COACH_PLAYBOOKS: Playbook[] = [
  {
    id: 'payment-too-high',
    title: 'Payment is too high',
    triggers: ['payment', 'too high', 'too much', 'monthly', 'afford', 'expensive', 'lower the price', 'cant afford', "can't afford"],
    lens: "Don't drop price on reflex. First isolate whether the hurdle is the payment or the car, then reframe payment as shapeable math (term, down, where you start) and anchor to value — not sticker.",
    exampleLine: "Totally fair. Quick question — is it the payment itself that's the hurdle, or the car? Because if the car's right, the payment's just math we can shape. What number were you hoping to land near?",
    followUp: "If they give a number, close assumptively: \"Got it — if I can get you within range of that on this one, are we doing it today?\" If they stay vague: \"Is it more than you budgeted, or more than you expected to pay for this car?\" — keep it neutral and let them answer.",
  },
  {
    id: 'just-looking',
    title: '"Just looking"',
    triggers: ['just looking', 'browsing', 'not ready', 'early', 'just started', 'window shopping'],
    lens: "'Just looking' is a shield against pressure. Disarm it, take the pressure off, and earn permission with a calibrated question that gets them talking about why they're really here.",
    exampleLine: "Perfect — honestly most people who drive one home started out 'just looking,' so you're in good company. No pressure from me. What kicked off the search — something change with your current ride?",
    followUp: "\"While you're standing here, want me to pull the two that actually fit what you just described so you're not guessing later? Costs you nothing and you'll know exactly where you stand.\" — a low-commitment yes that starts the relationship.",
  },
  {
    id: 'think-about-it',
    title: 'Think about it / be-back',
    triggers: ['think about it', 'be back', 'sleep on it', 'decide later', 'get back to you', 'think it over', 'need time'],
    lens: "'I'll think about it' is almost never the real reason — it's a polite exit. Surface which of the three things is actually open (the car, the numbers, the timing), then loop on that one.",
    exampleLine: "Makes sense. When folks tell me they want to think about it, it's usually one of three things still open — the car, the numbers, or the timing. If you're being straight with yourself, which one's it leaning toward?",
    followUp: "Loop on whatever they name, then isolate: \"Other than [that], is there anything else that would stop us from wrapping this up today?\" If nothing else — you've found the one thing to solve and you close on it.",
  },
  {
    id: 'trade-value',
    title: 'Trade value gap',
    triggers: ['trade', 'my car worth', 'payoff', 'upside down', 'lowball', 'low-balled', 'trade-in', 'trade value', 'negative equity'],
    lens: "The trade number stings in isolation, but it's a distraction. Move them off the trade and onto the only number that matters — the net difference between the two cars / the out-the-door.",
    exampleLine: "I hear you, and the trade number stings on its own. But the only number that actually decides this is the difference between what you've got and what you're getting. Let's look at your out-the-door net — that's where the real deal shows up.",
    followUp: "\"If that difference lands where it should, does the trade figure still bug you — or are we good?\" Build certainty that the deal is fair as a whole rather than defending one line.",
  },
  {
    id: 'lease-vs-finance',
    title: 'Lease vs finance',
    triggers: ['lease', 'finance', 'should i buy', 'lease or buy', 'lease vs', 'miles', 'buy or lease'],
    lens: "Don't pitch one — let their usage pick it. Two questions decide it: annual miles and whether they like a fresh car every few years or owning long-term. Then recommend with the why.",
    exampleLine: "Easy way to call it — roughly how many miles a year do you drive, and do you like being in something new every couple years or keeping it long-term and eventually payment-free?",
    followUp: "Give the recommendation with the reason behind it, then: \"Want me to run both side by side so you see the real monthly and what you actually walk away with at the end of each?\" — let the numbers confirm what they already leaned toward.",
  },
  {
    id: 'ghosting',
    title: 'Ghosting / no response',
    triggers: ['ghost', 'no response', 'not responding', 'wont reply', "won't reply", 'stopped responding', 'follow up', 'follow-up', 'no reply', 'went quiet', 'not answering'],
    lens: "Silence isn't a no — it's a lack of a reason to reply. Never send 'just checking in'; that's delete-bait. Give them a concrete reason and work a real cadence — the average rep quits at touch two; the sale's usually at five.",
    exampleLine: "Skip 'just checking in.' Give them a reason to reply: \"Hey [name] — the [vehicle] you looked at just had a price adjustment, and one came in with [feature you know they wanted]. Want me to hold it before it moves?\"",
    followUp: "Run the cadence across channels: text today, a quick call tomorrow, one more text 48 hours later — each with a NEW reason, never a nag. Persistence is professional, not pushy. Log every touch so the follow-up stays disciplined.",
  },
  {
    id: 'price-shopping',
    title: 'Price shopping / competitor quote',
    triggers: ['other dealer', 'beat this', 'cheaper', 'price shopping', 'shopping', 'quote', 'match', 'competitor', 'another dealership', 'better price'],
    lens: "Racing to the bottom loses money and respect. Sell the whole package — the product, you, and the store — and get the competing offer in writing, because most 'beat this' quotes are missing fees or a different trim.",
    exampleLine: "I might be able to match it, I might not — but let me ask you straight: if we're within a few bucks, who do you want to buy from? The voice on the phone, or the person who's going to take care of you for the next five years?",
    followUp: "\"Send me their quote in writing and I'll tell you honestly if it's real — apples to apples, what's their out-the-door?\" Nine times out of ten the comparison falls apart and you've reframed it to value and trust, not price.",
  },
  {
    id: 'spouse-not-here',
    title: 'Spouse / partner not present',
    triggers: ['spouse', 'wife', 'husband', 'partner', 'talk to my', 'not here', 'check with', 'run it by', 'significant other', 'my wife', 'my husband'],
    lens: "Don't fight the absent decision-maker — enroll them. Find out what THEY'll care about, then make it easy to bring them in now rather than letting the deal cool overnight on a game of telephone.",
    exampleLine: "Smart — a call like this should be a team decision. What do you think they'll want to know first: the payment, or whether it's the right fit for the family?",
    followUp: "\"Let's get them on a quick call right now so they hear it straight from you — or I'll put together a one-pager with the numbers so you've got everything to walk them through tonight. Which is easier?\" — an assumptive next step with zero pressure.",
  },
];

// Lightweight intent match: score playbooks by how many triggers appear in the
// rep's message, return the best `max`. Empty when nothing clearly matches (Rex
// then coaches from the system prompt alone).
export function matchPlaybooks(text: string, max = 2): Playbook[] {
  const q = ` ${text.toLowerCase()} `;
  const scored = COACH_PLAYBOOKS
    .map((pb) => ({ pb, score: pb.triggers.reduce((n, t) => (q.includes(t) ? n + 1 : n), 0) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.pb);
}

function serializePlaybooks(pbs: Playbook[]): string {
  if (pbs.length === 0) return '';
  const blocks = pbs
    .map(
      (pb) =>
        `• ${pb.title}\n  Lens: ${pb.lens}\n  Example line: ${pb.exampleLine}\n  If they push back: ${pb.followUp}`,
    )
    .join('\n');
  return `RELEVANT PLAYBOOK(S) — use as your backbone, but adapt to the exact details the rep gives you (don't just parrot it):\n${blocks}`;
}

type CoachTurn = { from: 'rex' | 'user'; text: string };

// Assembles the full message list for callBrain: a system message (coaching
// prompt + copy rules + any matched playbook + the rep's real book), the recent
// conversation as real turns, and the rep's new message.
export function buildCoachMessages(input: {
  history: CoachTurn[];
  text: string;
  repContext: string;
}): BrainMessage[] {
  const { history, text, repContext } = input;
  const playbookBlock = serializePlaybooks(matchPlaybooks(text));

  const system = [
    COACH_SYSTEM_PROMPT,
    REX_COPY_RULES,
    playbookBlock,
    repContext ? `THE REP'S BOOK (use real names/numbers when relevant):\n${repContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const turns: BrainMessage[] = history
    .slice(-10)
    .map((m) => ({ role: m.from === 'rex' ? 'assistant' : 'user', content: m.text }));

  return [
    { role: 'system', content: system },
    ...turns,
    { role: 'user', content: text },
  ];
}
