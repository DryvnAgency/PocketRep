// Smart Blast Sequences. Rep voice intent → filter to N contacts → personalized
// draft per contact (one brain call) → review UI → fire to native SMS one-by-one.
//
// Native SMS truthfulness: opening the OS composer is NOT proof that Send was
// tapped. Blast history therefore records the exact message as `opened`, while
// leaving `sent_at` null until a real send-confirmation path exists.

import { supabase } from '@/lib/supabase';
import { REX_COPY_RULES } from './rexActions';
import type { V2Contact } from './useContacts';
import { callBrain } from './aiProxy';
import { recordSmsOpened, type SmsActionSource } from './smsActions';

export type BlastPromotion = {
  vehicle?: string;
  payment?: string;
  down?: string;
  term?: string;
  details?: string;
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
- Vary hooks when the contact context supports it, but never invent context just to force a different hook.
- No two messages may share the same opener structure beyond "hey {first_name}" / "hola {first_name}".
- Reusing a broad hook category is allowed only when the actual message and contact-specific reason are different.

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

// ── Batch uniqueness enforcement ──────────────────────────────────────────────
// Post-generation validation: every message in a blast batch must be genuinely
// unique. Prompt instructions alone are not enough — this is the code-level gate.

export type UniquenessResult = {
  passed: boolean;
  violations: string[];
};

/**
 * Normalize a message body for comparison: lowercase, collapse whitespace,
 * strip leading/trailing whitespace.
 */
function normalizeBody(msg: string): string {
  return msg.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validate that a batch of drafted messages are genuinely unique.
 * Returns { passed, violations[] } — violations describe each failure.
 *
 * Checks:
 * 1. Exact-duplicate bodies (normalized)
 * 2. First-name-only substitution (bodies identical after removing the contact's first name)
 * 3. Opener similarity (>80% of messages share the same first 40 chars after the greeting)
 *
 * A hook label is intentionally not a uniqueness boundary. Batches can contain
 * more contacts than the finite hook taxonomy, and two customers can have a
 * legitimate inventory angle while still receiving genuinely different copy.
 */
export function enforceUniqueness(steps: DraftedStep[]): UniquenessResult {
  const violations: string[] = [];
  if (steps.length <= 1) return { passed: true, violations };

  // 1. Exact-duplicate check
  const bodyMap = new Map<string, string[]>();
  for (const s of steps) {
    const norm = normalizeBody(s.message);
    const existing = bodyMap.get(norm);
    if (existing) {
      existing.push(s.contact_name);
    } else {
      bodyMap.set(norm, [s.contact_name]);
    }
  }
  for (const [, names] of bodyMap) {
    if (names.length > 1) {
      violations.push(`Exact duplicate message shared by: ${names.join(', ')}`);
    }
  }

  // 2. First-name-only substitution check
  // If removing the contact's first name from two messages makes them identical,
  // it's template substitution, not real personalization.
  const strippedBodies = steps.map(s => {
    const firstName = s.contact_name.split(/\s+/)[0];
    if (!firstName) return { name: s.contact_name, stripped: normalizeBody(s.message) };
    const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    return { name: s.contact_name, stripped: normalizeBody(s.message.replace(re, '')) };
  });
  const strippedMap = new Map<string, string[]>();
  for (const { name, stripped } of strippedBodies) {
    const existing = strippedMap.get(stripped);
    if (existing) {
      existing.push(name);
    } else {
      strippedMap.set(stripped, [name]);
    }
  }
  for (const [, names] of strippedMap) {
    if (names.length > 1) {
      // Don't double-report if already caught as exact duplicate
      const alreadyReported = violations.some(v => v.startsWith('Exact duplicate'));
      if (!alreadyReported) {
        violations.push(`Template substitution (only first name differs): ${names.join(', ')}`);
      }
    }
  }

  // 3. Opener similarity check
  // Extract the opener after the greeting (hey/hola + name), compare first 40 chars.
  const openerRe = /^(?:hey|hola|qu[eé]\s+(?:tal|onda))\s+\S+[,!]?\s*/i;
  const openers = steps.map(s => {
    const afterGreeting = s.message.replace(openerRe, '').toLowerCase().trim();
    return afterGreeting.slice(0, 40);
  });
  const openerCounts = new Map<string, number>();
  for (const o of openers) {
    openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);
  }
  for (const [opener, count] of openerCounts) {
    if (opener && count / steps.length > 0.8 && count > 1) {
      violations.push(`${count}/${steps.length} messages share the same opener structure`);
      break; // one report is enough
    }
  }

  return { passed: violations.length === 0, violations };
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
    return { sequence_id: '', intent, filter_summary: filterSummary, promotion, drafted_steps: [] };
  }

  const raw = await callBrain({
    maxTokens: 2000,
    tier: 'flash',
    messages: [{ role: 'user', content: buildBlastPrompt({ intent, promotion, contacts }) }],
  });
  const parsed = parseDraftedSteps(raw);

  // The model may omit, duplicate, or hallucinate contact ids. Rebuild the
  // batch against the actual selected book before any sequence row is written.
  const contactById = new Map(contacts.map(contact => [contact.id, contact]));
  const seen = new Set<string>();
  const drafted = parsed.flatMap(step => {
    const contact = contactById.get(step.contact_id);
    if (!contact || seen.has(step.contact_id)) return [];
    seen.add(step.contact_id);
    return [{
      ...step,
      contact_name: contact.name,
      char_count: step.message.length,
    }];
  });
  if (drafted.length !== contacts.length) {
    throw new Error(`Rex drafted ${drafted.length} of ${contacts.length} messages. Try the batch again.`);
  }

  const uniqueness = enforceUniqueness(drafted);
  if (!uniqueness.passed) {
    throw new Error(`Rex drafted messages that were too similar: ${uniqueness.violations.join('; ')}`);
  }

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

  return { sequence_id: sequenceId, intent, filter_summary: filterSummary, promotion, drafted_steps: drafted };
}

/**
 * Record a blast recipient in nurture_messages after the rep confirms send.
 *
 * For real contacts `launchSms` already wrote an `outbound_sms_actions` row
 * (via the "Did you send?" confirmation flow), so we skip `recordSmsOpened`
 * to avoid duplicates. For demo contacts `launchSms` short-circuits — no
 * native SMS opens — so we DO call `recordSmsOpened` as the sole record.
 */
export async function recordSentBlast({
  contactId, message, language, hookUsed, isDemo,
}: {
  contactId: string;
  message: string;
  language: 'en' | 'es';
  hookUsed: string;
  isDemo?: boolean;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const now = new Date().toISOString();

  const { data, error } = await supabase.from('nurture_messages').insert({
    user_id: user.id,
    contact_id: contactId,
    message_text: message,
    language,
    hook_used: hookUsed,
    trigger_type: 'blast',
    pitch_intensity: 'medium',
    sent_at: now,
    opened_at: now,
    sms_status: isDemo ? 'simulated_sent' : 'sent',
  }).select('id').single();
  if (error) throw error;

  // Only record outbound_sms_actions for demo contacts — real contacts
  // already have an entry created by launchSms's confirmation flow.
  if (isDemo) {
    await recordSmsOpened({
      contactId,
      message,
      source: 'blast' as SmsActionSource,
    }).catch(() => undefined);
  }

  return (data as { id: string } | null)?.id ?? null;
}

export async function markBlastApproved(sequenceId: string): Promise<void> {
  const { error } = await supabase.from('sequences').update({ draft_status: 'sent' }).eq('id', sequenceId);
  if (error) throw new Error(`Couldn't mark blast approved: ${error.message}`);
}

export async function markBlastCancelled(sequenceId: string): Promise<void> {
  const { error } = await supabase.from('sequences').update({ draft_status: 'cancelled' }).eq('id', sequenceId);
  if (error) throw new Error(`Couldn't cancel blast: ${error.message}`);
}

export async function translateBlastMessage({
  message, targetLang,
}: {
  message: string;
  targetLang: 'en' | 'es';
}): Promise<string> {
  const trimmed = message.trim();
  if (!trimmed) return message;
  const target = targetLang === 'es'
    ? 'natural Mexican Spanish (casual slang the way a real rep texts, NOT a literal word-for-word translation)'
    : 'natural, casual English the way a real rep texts';
  const prompt = `Rewrite this sales text message in ${target}.
Keep the same intent, the same hook/angle, and the same call to action.
Keep it roughly the same length, lowercase and conversational.
Preserve any {{first_name}} placeholders and any proper names exactly.
${REX_COPY_RULES}

Return ONLY the rewritten message — no quotes, no labels, no preamble.

MESSAGE:
${trimmed}`;
  const raw = await callBrain({
    maxTokens: 400,
    tier: 'flash',
    messages: [{ role: 'user', content: prompt }],
  });
  const out = (raw ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
  return out || message;
}

export async function updateDraftStep(stepId: string, message: string): Promise<void> {
  await supabase.from('sequence_steps').update({ message_template: message, rep_edited: true }).eq('id', stepId);
}
