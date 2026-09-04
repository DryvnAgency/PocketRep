import type { V2Contact } from './useContacts';
import { TIERS } from '@/components/v2/tokens';
import { callBrain } from './aiProxy';
import { loadRepIdentity } from './coachThread';

export type GamePlanChannel = 'call' | 'text' | 'email';
export type GamePlanResult = {
  channel: GamePlanChannel;
  why: string;
  script: string;
};

// Mirrors coachBrain.ts's DEFAULT_REP_NAME / DEFAULT_DEALERSHIP — the shared
// demo account is Eddie's book everywhere else Rex speaks, so Game Plan stays
// consistent with that when loadRepIdentity() can't resolve a real name.
const DEFAULT_REP_NAME = 'Eddie';
const DEFAULT_DEALERSHIP = 'Nissan of Omaha';
// loadRepIdentity() deliberately returns this literal (not a real name) for a
// signed-in real rep who hasn't set profiles.full_name yet, specifically so
// Rex never calls a stranger "Eddie" — see coachThread.ts. It's an internal
// addressing token only: never safe to print as a signature a customer reads.
const UNNAMED_REP_TOKEN = 'the rep';

function buildPrompt(c: V2Contact, notes: string, repName: string, dealership: string, signable: boolean, industry: string = 'Automotive'): string {
  const tier = TIERS[c.tier];
  // The contact's preferred language (the SCRIPT EN/ES toggle) decides the
  // language Rex writes the script in — otherwise it always came back English.
  const langLine = c.preferredLanguage === 'es'
    ? `LANGUAGE: This customer's preferred language is Spanish. Write the WHY line and the ENTIRE SCRIPT in natural, fluent neutral Latin-American Spanish. Keep only the CHANNEL value in English (call | text | email).`
    : `LANGUAGE: Write the WHY line and the SCRIPT in English.`;
  const signOff = signable
    ? `End with "${repName}" only on text/email.`
    : `Do not sign the script with any name — end on the message itself.`;
  return `You are Rex, the AI sales coach inside PocketRep. Coach ${repName}, a ${dealership} rep, on their next move with this customer.

Customer context:
- Name: ${c.name}
- Vehicle of interest: ${c.vehicle ?? 'unknown'}, ${c.trim ?? ''}
- Budget: $${c.budget ?? '—'}
- Trade-in: ${c.tradeIn ?? 'none'}
- Plan: ${c.planLabel ?? '—'}
- Tier: ${tier.label} (${c.days} day${c.days === 1 ? '' : 's'} since last contact)

${repName}'s notes on this customer:
${notes || '(no notes yet)'}

Pick the single best NEXT action: call, text, or email. Then draft the exact script.

Respond in EXACTLY this format (no extra text):
CHANNEL: <call | text | email>
WHY: <one sentence, max 18 words>
SCRIPT:
<For a call: opening line + 2-3 key questions. For text: 2-3 sentences, no emojis. For email: short body, no signature. ${signOff}>

${langLine}

${industry.toLowerCase() === 'automotive' ? '' : `INDUSTRY OVERRIDE: This rep selected ${industry}. Use their real industry context and neutral product/service language. Do not invent automotive facts unless the customer notes actually contain them.`}`;
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
  // Real identity, not a hardcoded persona — this script gets texted/emailed to
  // an actual customer, so it must be signed by the rep who is actually working
  // the deal (or not signed at all), never a fictional name.
  const identity = await loadRepIdentity().catch(() => ({} as { name?: string; dealership?: string; industry?: string }));
  const rawName = (identity.name ?? '').trim();
  const repName = rawName || DEFAULT_REP_NAME;
  const dealership = (identity.dealership ?? '').trim() || DEFAULT_DEALERSHIP;
  const industry = (identity.industry ?? '').trim() || 'Automotive';
  const signable = repName !== UNNAMED_REP_TOKEN;
  const raw = await callBrain({
    maxTokens: 600,
    tier: 'flash',
    messages: [{ role: 'user', content: buildPrompt(c, notes, repName, dealership, signable, industry) }],
  });
  return parseResponse(raw);
}
