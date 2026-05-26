// Smart Blast Sequences. Rep voice intent → filter to N contacts → personalized
// draft per contact (one brain call) → review UI → fire to native SMS one-by-one.
//
// We persist the sequence + per-contact steps so the rep can come back to a
// pending review later (sequences.draft_status='pending_review').

import { supabase } from '@/lib/supabase';
import { REX_COPY_RULES } from './rexActions';
import type { V2Contact } from './useContacts';

const AI_PROXY_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

export type BlastPromotion = {
  vehicle?: string;
  payment?: string;
  down?: string;
  term?: string;
  details?: string; // free-form catch-all
};

export type DraftedStep = {
  contact_id: string;
  contact_name: string;
  language: 'en' | 'es';
  message: string;
  game_plan: string;
  hook_used: string;
  char_count: number;
};

export type BlastDraft = {
  sequence_id: string;
  intent: string;
  filter_summary: string;
  promotion: BlastPromotion;
  drafted_steps: DraftedStep[];
};

type PromptInput = {
  intent: string;
  promotion: BlastPromotion;
  contacts: V2Contact[];
};

function buildBlastPrompt({ intent, promotion, contacts }: PromptInput): string {
  const contactBlock = contacts.map(c => {
    const bits: Record<string, any> = {
      id: c.id,
      name: c.name,
      heat: c.heatScore,
      vehicle_model: c.vehicleModel ?? c.vehicle,
      vehicle_year: c.vehicleYear,
      lease_end: c.leaseEndDate,
      current_mileage: c.currentMileage,
      preferred_language: c.preferredLanguage,
      last_contact_summary: c.notes ?? null,
    };
    return JSON.stringify(bits);
  }).join(',\n');

  return `You are Rex drafting a personalized batch outreach.

The rep said: "${intent}"

PROMOTION:
${JSON.stringify(promotion)}

You drafted to ${contacts.length} contact${contacts.length === 1 ? '' : 's'}. For EACH contact below, write ONE unique message that:
1. Opens with "hey" (EN) or "hola" / "qué tal" / "qué onda" (ES) — lowercase.
2. Weaves in the promotion above using the contact's own context.
3. Hooks into ONE angle (pick a different one per contact across this batch):
   - calendar_event (lease timing, season, anniversary)
   - vehicle_interest (model match, color, package)
   - past_purchase (already owns a vehicle from you)
   - pricing (Memorial Day, year-end, model-year clearance)
   - rapport (last conversation note, personal detail)
   - inventory (just hit the lot)
   - personal_detail (something specific from notes)
4. Closes with "let me know if I can help with anything" (EN) or "avísame si te puedo ayudar con algo" (ES) — pick one of the closer variants.
5. If preferred_language is "es", REWRITE in Mexican Spanish slang. Never translate literally.
6. If mileage or lease_end is missing, do NOT invent numbers. Soften: "if you're getting close to your cap" / "your lease should be wrapping up around [month]".

VARIETY RULE within this batch:
- No two messages may share the same hook_used.
- No two messages may share the same opener structure beyond "hey {first_name}" / "hola {first_name}".

${REX_COPY_RULES}

CONTACTS:
[
${contactBlock}
]

Return ONLY a single JSON object inside a \`\`\`json fenced block:
{
  "drafted_steps": [
    {
      "contact_id": "...",
      "contact_name": "...",
      "language": "en" | "es",
      "message": "the draft text",
      "game_plan": "1 short sentence — why this angle for this contact",
      "hook_used": "calendar_event" | "vehicle_interest" | "past_purchase" | "pricing" | "rapport" | "inventory" | "personal_detail",
      "char_count": <number>
    }
  ]
}`;
}

function parseDraftedSteps(raw: string): DraftedStep[] {
  if (!raw) return [];
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const jsonText = (fence ? fence[1] : raw).trim();
  try {
    const obj = JSON.parse(jsonText);
    const steps = Array.isArray(obj.drafted_steps) ? obj.drafted_steps : [];
    return steps.map((s: any) => ({
      contact_id: String(s.contact_id ?? ''),
      contact_name: String(s.contact_name ?? ''),
      language: (s.language === 'es' ? 'es' : 'en') as 'en' | 'es',
      message: String(s.message ?? ''),
      game_plan: String(s.game_plan ?? ''),
      hook_used: String(s.hook_used ?? 'rapport'),
      char_count: Number(s.char_count ?? (s.message?.length ?? 0)),
    })).filter((s: DraftedStep) => s.contact_id && s.message);
  } catch {
    return [];
  }
}

// Local copy-rule sanity check — flags any draft that slips a forbidden token
// past the brain. Returns the indexes that need a redraft (handled in the UI).
const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'em-dash', re: /—/ },
  { name: 'en-dash', re: /–/ },
  { name: 'hyphen-as-separator', re: /\s-\s/ },
  { name: 'no-pressure', re: /\bno\s+(pressure|rush|hurry)\b/i },
  { name: 'just-checking-in', re: /\bjust\s+checking\s+in\b/i },
  { name: 'touching-base', re: /\btouching\s+base\b/i },
  { name: 'hope-this-finds', re: /\bhope\s+(this\s+finds|all\s+is\s+well)/i },
  { name: 'wanted-to-reach-out', re: /\bwanted\s+to\s+reach\s+out\b/i },
  { name: 'following-up-on', re: /\bfollowing\s+up\s+on\b/i },
];

export function copyRuleViolations(message: string): string[] {
  const hits: string[] = [];
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.re.test(message)) hits.push(p.name);
  }
  return hits;
}

export async function createBlastDraft({
  intent, filterSummary, promotion, contacts,
}: {
  intent: string;
  filterSummary: string;
  promotion: BlastPromotion;
  contacts: V2Contact[];
}): Promise<BlastDraft> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  if (contacts.length === 0) {
    return {
      sequence_id: '',
      intent,
      filter_summary: filterSummary,
      promotion,
      drafted_steps: [],
    };
  }

  // 1) Ask the brain to draft one message per contact.
  const res = await fetch(`${AI_PROXY_URL}/brain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildBlastPrompt({ intent, promotion, contacts }) }],
    }),
  });
  if (!res.ok) throw new Error(`ai-proxy ${res.status}`);
  const json = await res.json();
  const raw = json.content?.[0]?.text ?? json.text ?? '';
  const drafted = parseDraftedSteps(raw);

  // 2) Persist the sequence + per-contact steps so the rep can come back to it.
  const inferredLanguage = (() => {
    const langs = new Set(drafted.map(d => d.language));
    if (langs.size > 1) return 'mixed';
    if (langs.has('es')) return 'es';
    return 'en';
  })();

  const { data: seq, error: seqErr } = await supabase
    .from('sequences')
    .insert({
      user_id: user.id,
      name: `Blast · ${filterSummary || new Date().toISOString().slice(0, 10)}`,
      description: intent,
      source_intent: intent,
      is_ai_drafted: true,
      is_template: false,
      is_custom: true,
      draft_status: 'pending_review',
      language: inferredLanguage,
    })
    .select('id')
    .single();
  if (seqErr) throw seqErr;
  const sequenceId = seq!.id as string;

  if (drafted.length > 0) {
    const rows = drafted.map((d, i) => ({
      sequence_id: sequenceId,
      step_number: i + 1,
      delay_days: 0,
      channel: 'text',
      message_template: d.message,
      ai_personalize: true,
      contact_id: d.contact_id,
      language: d.language,
      hook_used: d.hook_used,
      game_plan: d.game_plan,
      rep_edited: false,
    }));
    const { error: stepsErr } = await supabase.from('sequence_steps').insert(rows);
    if (stepsErr) throw stepsErr;
  }

  return {
    sequence_id: sequenceId,
    intent,
    filter_summary: filterSummary,
    promotion,
    drafted_steps: drafted,
  };
}

// Log each sent (or skipped) draft into nurture_messages for variety tracking.
export async function recordSentBlast({
  contactId, message, language, hookUsed,
}: {
  contactId: string;
  message: string;
  language: 'en' | 'es';
  hookUsed: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('nurture_messages').insert({
    user_id: user.id,
    contact_id: contactId,
    message_text: message,
    language,
    hook_used: hookUsed,
    trigger_type: 'blast',
    pitch_intensity: 'medium',
    sent_at: new Date().toISOString(),
  });
}

export async function markBlastApproved(sequenceId: string): Promise<void> {
  await supabase
    .from('sequences')
    .update({ draft_status: 'sent' })
    .eq('id', sequenceId);
}

export async function markBlastCancelled(sequenceId: string): Promise<void> {
  await supabase
    .from('sequences')
    .update({ draft_status: 'cancelled' })
    .eq('id', sequenceId);
}

export async function updateDraftStep(stepId: string, message: string): Promise<void> {
  await supabase
    .from('sequence_steps')
    .update({ message_template: message, rep_edited: true })
    .eq('id', stepId);
}
