// NEW 5 — whole-conversation parse. The rep dictates/pastes a real customer
// conversation; Rex extracts a CRM update: contact fields + a notes summary + a
// suggested next-step plan + a follow-up timing. The result is proposed behind
// the same confirm-before-write card (RexCoach), which then runs add_contact (or
// update_notes) + an optional schedule_followup through the existing engine.

import { callBrain } from './aiProxy';

export type ConversationParse = {
  match_contact_id: string | null; // existing contact, if recognized
  is_new: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  vehicle: string | null;
  budget: string | null;
  trade_in: string | null;
  heat_tier: 'hot' | 'warm' | 'cold' | null;
  notes: string; // summary to save
  plan: string;  // suggested next move (rep-facing)
  followup_days: number | null;
};

function buildPrompt(transcript: string, contacts: { id: string; name: string }[]): string {
  const ids = contacts.slice(0, 80).map(c => `${c.name} | ${c.id}`).join('\n') || '(none)';
  return `You are Rex. The rep just finished this conversation with a customer (raw, possibly messy, dictated or pasted). Turn it into a CRM update.

CONTACT IDS (name | id). If the customer clearly matches one, set match_contact_id and is_new=false. Otherwise is_new=true:
${ids}

Return ONLY a JSON object inside a \`\`\`json fenced block:
{
  "match_contact_id": "<existing id or null>",
  "is_new": true,
  "first_name": "<or null>",
  "last_name": "<or null>",
  "phone": "<digits only or null>",
  "vehicle": "<vehicle of interest or null>",
  "budget": "<or null>",
  "trade_in": "<their trade-in or null>",
  "heat_tier": "hot" | "warm" | "cold" | null,
  "notes": "<2-5 sentences: what they want, objections, what was agreed>",
  "plan": "<the single best next move for the rep, 1-2 sentences>",
  "followup_days": <integer days until follow-up, or null>
}

Rules: NEVER invent a name, phone, number, or vehicle that isn't in the conversation — leave it null. If the customer isn't named, keep names null and is_new=true. "notes" and "plan" are rep-facing (no copy rules). Keep it tight.

CONVERSATION:
${transcript}`;
}

export async function extractFromConversation(
  transcript: string,
  contacts: { id: string; name: string }[],
): Promise<ConversationParse> {
  const raw = await callBrain({
    maxTokens: 900,
    messages: [{ role: 'user', content: buildPrompt(transcript, contacts) }],
  });
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const obj = JSON.parse((fence ? fence[1] : raw).trim());
  const matched = (obj.match_contact_id && String(obj.match_contact_id)) || null;
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  const tier = obj.heat_tier === 'hot' || obj.heat_tier === 'warm' || obj.heat_tier === 'cold' ? obj.heat_tier : null;
  return {
    match_contact_id: matched,
    is_new: matched ? false : true,
    first_name: obj.first_name ?? null,
    last_name: obj.last_name ?? null,
    phone: obj.phone ? String(obj.phone) : null,
    vehicle: obj.vehicle ?? null,
    budget: obj.budget != null ? String(obj.budget) : null,
    trade_in: obj.trade_in ?? null,
    heat_tier: tier,
    notes: String(obj.notes ?? '').trim(),
    plan: String(obj.plan ?? '').trim(),
    followup_days: num(obj.followup_days),
  };
}
