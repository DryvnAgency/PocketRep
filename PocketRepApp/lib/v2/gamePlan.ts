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
  // The contact's preferred language (the SCRIPT EN/ES toggle) decides the
  // language Rex writes the script in — otherwise it always came back English.
  const langLine = c.preferredLanguage === 'es'
    ? `LANGUAGE: This customer's preferred language is Spanish. Write the WHY line and the ENTIRE SCRIPT in natural, fluent neutral Latin-American Spanish. Keep only the CHANNEL value in English (call | text | email).`
    : `LANGUAGE: Write the WHY line and the SCRIPT in English.`;
  return `You are Rex, the AI sales coach inside PocketRep. Coach Jake (senior BMW advisor) on his next move with this customer.

Customer context:
- Name: ${c.name}
- Vehicle of interest: ${c.vehicle ?? 'unknown'}, ${c.trim ?? ''}
- Budget: $${c.budget ?? '—'}
- Trade-in: ${c.tradeIn ?? 'none'}
- Plan: ${c.planLabel ?? '—'}
- Tier: ${tier.label} (${c.days} day${c.days === 1 ? '' : 's'} since last contact)

Jake's notes on this customer:
${notes || '(no notes yet)'}

Pick the single best NEXT action: call, text, or email. Then draft the exact script.

Respond in EXACTLY this format (no extra text):
CHANNEL: <call | text | email>
WHY: <one sentence, max 18 words>
SCRIPT:
<For a call: opening line + 2-3 key questions. For text: 2-3 sentences, no emojis. For email: short body, no signature. End with "Jake" only on text/email.>

${langLine}`;
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
    tier: 'flash',
    messages: [{ role: 'user', content: buildPrompt(c, notes) }],
  });
  return parseResponse(raw);
}
