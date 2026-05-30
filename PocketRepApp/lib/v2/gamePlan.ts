import type { V2Contact } from './useContacts';
import { TIERS } from '@/components/v2/tokens';
import { callBrain } from './aiProxy';

export type GamePlanChannel = 'call' | 'text' | 'email';
export type GamePlanResult = {
  channel: GamePlanChannel;
  why: string;
  script: string;
};

function buildPrompt(c: V2Contact, notes: string): string {
  const tier = TIERS[c.tier];
  return `You are Rex, the AI sales coach inside PocketRep. Coach the rep (a seasoned automotive sales pro) on the single best next move with this customer.

Customer context:
- Name: ${c.name}
- Vehicle of interest: ${c.vehicle ?? 'unknown'}, ${c.trim ?? ''}
- Budget: $${c.budget ?? '—'}
- Trade-in: ${c.tradeIn ?? 'none'}
- Plan: ${c.planLabel ?? '—'}
- Tier: ${tier.label} (${c.days} day${c.days === 1 ? '' : 's'} since last contact)

Rep's notes on this customer:
${notes || '(no notes yet)'}

Pick the single best NEXT action: call, text, or email. Lean on automotive retention angles when they fit — trade equity, lease timing, service or maintenance, referrals, or an anniversary touch. Then draft the exact script.

Respond in EXACTLY this format (no extra text):
CHANNEL: <call | text | email>
WHY: <one sentence, max 18 words>
SCRIPT:
<For a call: opening line + 2-3 key questions. For text: 2-3 sentences, no emojis. For email: short body. Do not sign off with a name — the rep sends from their own phone.>`;
}

function parseResponse(raw: string): GamePlanResult {
  const text = (raw || '').trim();
  const chMatch = text.match(/CHANNEL:\s*(call|text|email)/i);
  const whyMatch = text.match(/WHY:\s*([^\n]+)/i);
  const scrIdx = text.toUpperCase().indexOf('SCRIPT:');
  return {
    channel: (chMatch?.[1].toLowerCase() as GamePlanChannel) ?? 'text',
    why: whyMatch?.[1].trim() ?? '',
    script: scrIdx >= 0 ? text.slice(scrIdx + 7).trim() : text,
  };
}

export async function generateGamePlan(c: V2Contact, notes: string): Promise<GamePlanResult> {
  const raw = await callBrain({
    maxTokens: 600,
    messages: [{ role: 'user', content: buildPrompt(c, notes) }],
  });
  return parseResponse(raw);
}
