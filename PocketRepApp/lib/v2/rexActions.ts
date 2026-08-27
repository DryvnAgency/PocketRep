// Rex tool-use mode. Given a transcript and the user's contacts/tags,
// asks ai-proxy/brain to choose an action + payload + spoken confirmation.
//
// The brain returns a single JSON object in a fenced code block. We parse
// it loosely; if Rex couldn't pick a structured action it falls back to a
// 'say' action that just speaks back to the rep without writing anything.

import { supabase } from '@/lib/supabase';
import { createContact, updateContactNotes, deleteContact, updateContactTier } from './updateContact';
import { createReminder } from './reminders';
import { insertDeal, type DealDraft } from './dealLogger';
import { getRexMemory, recordRexTurn } from './rexMemory';
import { loadBookContext, bookContextForPrompt } from './bookContext';
import { chooseNextCall } from './callNext';
import { executeBatchAction, type BatchActionKind } from './batchActions';
import { callBrainStream, type BrainMessage } from './aiProxy';
import type { V2Contact } from './useContacts';
import { isRexMultistepEnabled, isVehicleFinderEnabled } from './rexFeatureFlags';
import { getRepSetting } from './repSettings';
import { frameUntrusted } from './promptSafety';
import type { VehicleRequirements } from './vehicleMatch';

export type RexAction =
  | { type: 'add_contact'; payload: AddContactPayload; say: string }
  | { type: 'update_notes'; payload: UpdateNotesPayload; say: string }
  | { type: 'delete_contact'; payload: DeleteContactPayload; say: string }
  | { type: 'log_deal'; payload: LogDealPayload; say: string }
  | { type: 'schedule_followup'; payload: ScheduleFollowupPayload; say: string }
  | { type: 'retier_contact'; payload: RetierContactPayload; say: string }
  | { type: 'create_reminder'; payload: CreateReminderPayload; say: string }
  | { type: 'show_contact'; payload: ShowContactPayload; say: string }
  | { type: 'filter_contacts'; payload: FilterContactsPayload; say: string }
  | { type: 'book_summary'; payload: BookSummaryPayload; say: string }
  | { type: 'call_next'; payload: CallNextPayload; say: string }
  | { type: 'batch_action'; payload: BatchActionPayload; say: string }
  | { type: 'create_blast_sequence'; payload: CreateBlastSequencePayload; say: string }
  | { type: 'analyze_stalled_leads'; payload: AnalyzeStalledLeadsPayload; say: string }
  | { type: 'schedule_nurture_blast'; payload: ScheduleNurtureBlastPayload; say: string }
  | { type: 'find_vehicles'; payload: FindVehiclesPayload; say: string }
  | { type: 'chain'; payload: ChainPayload; say: string }
  | { type: 'clarify'; payload: ClarifyPayload; say: string }
  | { type: 'say'; payload: Record<string, never>; say: string };

// Vehicle Finder pivot (EXPO_PUBLIC_VEHICLE_FINDER). The interpreting model
// extracts the customer's requirements inline into `requirements` (no second AI
// call on the voice path); AppShell opens VehicleFinderModal pre-filled. Nothing
// is written — executeAction returns { ok: true } and the modal is the result.
export type FindVehiclesPayload = {
  raw_notes?: string;
  requirements?: VehicleRequirements;
};

export type AnalyzeStalledLeadsPayload = {
  days_silent_threshold?: number;
  include_dead?: boolean;
};

export type ScheduleNurtureBlastPayload = {
  trigger: 'holiday' | 'quarterly_check_in' | 'custom';
  audience: 'dead' | 'dormant' | 'past_customers' | 'all_inactive';
  custom_intent?: string;
};

export type CreateBlastSequencePayload = {
  intent: string;
  filter_criteria: string;
  filter_summary: string;
  contact_ids: string[];
  promotion: {
    vehicle?: string;
    payment?: string;
    down?: string;
    term?: string;
    details?: string;
  };
};

export type AddContactPayload = {
  first_name: string;
  last_name?: string;
  phone?: string;
  vehicle?: string;
  budget?: string;
  trade_in?: string;
  notes?: string;
  heat_tier?: 'hot' | 'warm' | 'cold';
  plan_label?: string;
};

export type UpdateNotesPayload = {
  contact_id: string;
  contact_name: string;
  notes_append: string;
};

export type DeleteContactPayload = {
  contact_id: string;
  contact_name: string;
};

export type LogDealPayload = {
  customer_name: string;
  contact_id?: string;
  stock: string;
  vehicle: string;
  front_gross: number;
  back_gross: number;
  type?: 'NEW' | 'CPO' | 'USED';
  funding?: 'finance' | 'lease' | 'cash';
  date?: string;
};

export type ScheduleFollowupPayload = {
  contact_id: string;
  contact_name: string;
  days_from_now: number;
  note?: string;
};

export type RetierContactPayload = {
  contact_id: string;
  contact_name: string;
  tier: 'hot' | 'warm' | 'cold';
  reason?: string;
};

export type CreateReminderPayload = {
  title: string;
  due_at: string; // ISO 8601 datetime the model resolved from natural language
  contact_id?: string | null;
  contact_name?: string | null;
  body?: string | null;
};

export type ShowContactPayload = {
  contact_id: string;
  contact_name: string;
};

export type FilterContactsPayload = {
  contact_ids: string[];
  filter_summary: string;
  matched_count: number;
};

export type BookSummaryPayload = {
  timeframe?: 'today' | 'this_week' | 'this_month' | 'ytd';
  total: number;
  by_tier: { hot: number; warm: number; cold: number; dead: number };
  stalled: number;
  needs_attention_ids?: string[];
};

export type CallNextPayload = {
  contact_id: string;
  contact_name: string;
  reason: string;
  suggested_opener: string;
};

export type BatchActionPayload = {
  contact_ids: string[];
  action: BatchActionKind;
  payload?: Record<string, any>;
  count: number;
};

export type ClarifyPayload = {
  question: string;
  candidates?: Array<{ id: string; label: string }>;
};

// P2-R3: a bundle of distinct write actions from one utterance, confirmed
// together. Steps are ordinary single actions (never nested chains).
export type ChainPayload = {
  steps: RexAction[];
};

// ---------------------------------------------------------------------------
// Copy rules — appended to every brain prompt that produces user-facing text.
// Bake these in so the entire surface obeys Lalo's tone spec without each
// caller having to repeat them.
// ---------------------------------------------------------------------------
export const REX_COPY_RULES = `COPY RULES (apply to every "say" line AND any draft you generate):
Tone:
- Casual, plain talk, how you'd text a friend.
- Lowercase opener: "hey" / "hola" / "qué tal" / "qué onda".
- No corporate jargon, no filler, no emojis (unless the contact uses them).

Punctuation:
- NEVER use dashes of any kind in drafts (em-dash —, en-dash –, or hyphen between phrases).
- Hyphens inside compound words ("trade-in", "follow-up") are fine.
- Use commas, periods, or line breaks for sentence breaks.
- NEVER use bullets or numbered lists in draft text. Conversational prose only.
- No semicolons in drafts. Short sentences.

Closers (use ONE):
- "let me know if I can help with anything"
- "just say the word"
- "let me know"
- "avísame si te puedo ayudar con algo" (ES)
- "nomás dime" (ES)
NEVER use: "no rush", "no pressure", "no hurry".

Anti-patterns (NEVER generate):
- "just checking in"
- "following up on our last conversation"
- "hope this finds you well" / "hope all is well"
- "I wanted to reach out" / "touching base"

Bilingual:
- Spanish is a rewrite, not a translation.
- Target Mexican slang: "carro" not "coche", "chamba" for work, "nomás" for "just", "qué onda" for casual greeting.
- Use Spanish if the contact's preferred_language is 'es'.

Length:
- Under 280 characters. 2-4 sentences max. One hook, one CTA, done.

Vehicle language:
- Trade-ins = "potential equity in your current vehicle".
- Don't say "your old car"; say "your current ride" or "what you're driving".

Inference language (when data is incomplete):
- If mileage or lease end date is INFERRED (not in the row), soften the phrasing: "if you're getting close to your cap" vs the confident "you're at 28k miles".
- Never fabricate specific numbers.`;

// P2-R2: a compact "where the rep is right now" block for the prompt. Empty when
// no screen is passed, so callers that don't supply it get a byte-identical prompt.
function buildScreenContext(opts: RexInterpretOpts, contacts: V2Contact[]): string {
  const screen = opts.activeScreen;
  if (!screen) return '';
  const screenLabel: Record<string, string> = {
    heat: "Heat Sheet (today's priority calls)",
    contacts: 'Contacts list',
    metrics: 'Metrics / deals',
    profile: 'Profile / settings',
  };
  let line = `Screen: ${screenLabel[screen] ?? screen}`;
  const sel = opts.selectedContactId ? contacts.find(c => c.id === opts.selectedContactId) : null;
  if (sel) line += `\nOpen contact (most likely "this" / "her" / "him"): ${sel.name} (id ${sel.id})`;
  return `\nWHERE THE REP IS RIGHT NOW (use to resolve deictic references like "this", "this one", "her", "him" — the open contact is the most likely referent, but defer to the BOOK STATE and to what the rep actually says):\n${line}\n`;
}

function buildPrompt(
  transcript: string,
  contacts: V2Contact[],
  tags: string[],
  memory: string,
  bookSection: string,
  screenContext: string,
): string {
  const tagList = tags.join(', ') || '(none)';
  // P2-R3 (default-off): only when multi-step is enabled do we tell the brain it
  // may bundle actions into a chain. Off → this string is empty and the prompt is
  // byte-identical to before.
  const multistep = isRexMultistepEnabled();
  const chainSection = multistep
    ? `\n17. chain — bundle 2+ DISTINCT write actions the rep asked for in one utterance, confirmed together. Use ONLY when the utterance clearly asks for several different things (e.g. "log the M3 deal for Marcus, set a follow-up next week, and tag him hot"). For a single intent, NEVER use chain — pick the one action. Do NOT nest chains. Only chain these write actions: add_contact, update_notes, delete_contact, log_deal, schedule_followup, retier_contact, create_reminder, batch_action.\n    payload: { steps: [ { "action": "log_deal", "payload": { ... } }, { "action": "schedule_followup", "payload": { ... } } ] }\n`
    : '';
  // Vehicle Finder (default-off): only when enabled do we teach Rex the
  // find_vehicles action. Off → empty string → the prompt is byte-identical.
  // Numbered after chain (18 when multistep is also on, else 17).
  const vehicleFinder = isVehicleFinderEnabled();
  const vehicleSection = vehicleFinder
    ? `\n${multistep ? 18 : 17}. find_vehicles — the rep describes what a CUSTOMER wants in a vehicle (monthly payment / budget, type, seats, features, colors, credit score, down payment) and wants matching inventory from the dealership site. Extract the requirements YOURSELF into the payload as plain integers (no "$" or ","). "500month" → monthly_budget 500; "3k down" → down_payment 3000.\n    payload: { raw_notes: string (the rep's words), requirements: { monthly_budget?, down_payment?, credit_score?, vehicle_type? ("suv"|"truck"|"sedan"|"minivan"|"coupe"|"hatchback"|"convertible"|"wagon"), min_seats?, features?: string[] (from: remote_start, heated_seats, sunroof, leather, awd, third_row, backup_camera, carplay, android_auto, navigation, tow_package, blind_spot), color_pref? ("dark"|"light"), colors?: string[], max_mileage?, max_price?, condition? ("new"|"used") } }\n    Use ONLY for inventory matching ("find her an SUV", "what do we have under 500 a month"), never for logging deals or adding contacts. The spoken line is a short ack ("on it, searching the lot now").\n`
    : '';
  const memorySection = memory.trim()
    ? `\nWHAT YOU REMEMBER ABOUT THIS REP (use to disambiguate / recall context — never quote it back verbatim):\n${memory.trim()}\n`
    : '';
  const tone = getRepSetting('voiceTone');
  const toneDirectives: Record<string, string> = {
    Steady: 'Tone: calm, patient, measured. Reassuring language. Trusted advisor energy.',
    Sharp: 'Tone: direct, confident, no fluff. Sharp desk manager energy.',
    Fire: 'Tone: high energy, urgency, momentum. Last day of the month energy.',
  };
  const toneDirective = toneDirectives[tone] ?? toneDirectives.Sharp;
  return `You are Rex, the voice assistant inside PocketRep — a sales rep CRM. The rep just said something to you. Pick the single best action.${multistep ? ' For a clearly multi-intent request you may return a chain (see action 17).' : ''}${memorySection}${screenContext}

${frameUntrusted('BOOK STATE', bookSection)}

Actions you can take, with required + optional payload fields:

1. add_contact — create a brand new contact
   payload: { first_name (req), last_name?, phone?, vehicle?, budget?, trade_in?, notes?, heat_tier? ("hot"|"warm"|"cold"), plan_label? ("TODAY"|"THIS WEEK"|"THIS MONTH"|"NEXT QTR") }

2. update_notes — append notes to an existing contact
   payload: { contact_id (req), contact_name (req), notes_append (req) }

3. delete_contact — soft-delete an existing contact
   payload: { contact_id, contact_name }

4. log_deal — record a closed sale
   payload: { customer_name (req), contact_id? (if matches existing), stock (req), vehicle (req), front_gross (req number), back_gross (req number), type? ("NEW"|"CPO"|"USED"), funding? ("finance"|"lease"|"cash"), date? ("YYYY-MM-DD") }

5. schedule_followup — set a follow-up date for a contact
   payload: { contact_id, contact_name, days_from_now (number), note? }

6. show_contact — open a contact's detail card
   payload: { contact_id, contact_name }

7. filter_contacts — the rep asked "who / how many / which" across the book. Return matching ids.
   payload: { contact_ids: uuid[], filter_summary: "3 Murano lease customers", matched_count: number }

8. book_summary — pipeline health snapshot. Use when the rep asks "how are things" / "what's my book look like".
   payload: { total, by_tier: { hot, warm, cold, dead }, stalled, needs_attention_ids?: uuid[] }

9. call_next — pick the single next call. Use when the rep asks "who first" / "who should I call".
   payload: { contact_id, contact_name, reason, suggested_opener }

10. batch_action — apply add_tag / mark_dead / mark_active / archive to multiple contacts.
    payload: { contact_ids: uuid[], action: "add_tag"|"mark_dead"|"mark_active"|"archive", payload?: {tag?: string}, count: number }

11. create_blast_sequence — rep wants to text/email a group with a specific promotion. Filter the book, parse the promo, return ids + parsed details. The client takes it from there (drafts per-contact + review UI).
    payload: {
      intent: string,              // full rep utterance
      filter_criteria: string,     // parsed filter
      filter_summary: string,      // "3 Murano lease customers"
      contact_ids: uuid[],         // matched ids from BOOK STATE
      promotion: {                 // parsed from the rep's words
        vehicle?: string,
        payment?: string,
        down?: string,
        term?: string,
        details?: string
      }
    }
    Use ONLY when the rep clearly wants to message a group. The "say" line MUST confirm the count ("found N <segment>, drafting now").

12. analyze_stalled_leads — the rep is asking "who haven't I contacted in X days/weeks" or wants a stalled review. The client takes over and runs the KILL/PUSH/FENCE analyzer.
    payload: { days_silent_threshold?: number, include_dead?: boolean }
    Default threshold is 14 days. The "say" line MUST be a short ack ("analyzing stalled leads now…") — DO NOT enumerate names; the analyzer will.

13. schedule_nurture_blast — generate nurture drafts for dead / dormant / past customers / all inactive. Variety + cadence enforced server-side (no contact gets > 1 nurture/30d, skip 60d after a reply, skip do_not_contact, 6mo pause after negative).
    payload: { trigger: "holiday" | "quarterly_check_in" | "custom", audience: "dead" | "dormant" | "past_customers" | "all_inactive", custom_intent?: string }
    Use ONLY when the rep is asking for a batch nurture (not an individual message). "say" confirms the audience ("queueing nurtures for past customers, review momentarily").

14. retier_contact — the rep signals a customer is reviving / heating back up: "back live", "wants numbers", "ready to move", "off the fence", "called back in", "they're hot again". PROPOSE bumping that customer UP the tier list (cold→warm, warm→hot, or straight to hot for strong intent). Only move UP here, never down. This just PROPOSES the change — nothing is written until the rep confirms.
    payload: { contact_id (req, from BOOK STATE), contact_name (req), tier ("hot"|"warm"|"cold"), reason? }
    The spoken line names the customer and the new tier ("sounds like Maria's back live — want me to move her to hot?").

15. clarify — the rep's request is ambiguous; ask back
    payload: { question, candidates?: [{id, label}] }

16. say — informational reply, no write
    payload: {}
${chainSection}${vehicleSection}
EXISTING TAGS the rep uses: ${tagList}

RULES:
- FORMAT (read carefully): FIRST write your spoken reply to the rep as ONE short plain-text line — this is exactly what Rex says out loud, so make it natural, under 18 words, and obey the COPY RULES. THEN, on the next line, output the action as a single \`\`\`json fenced block: { "action": "...", "payload": { ... } }. Put NOTHING after the closing fence. Your spoken line streams to the rep as you type it, so always lead with it.
- The spoken line IS your reply to the rep — do not also put it in a JSON "say" field (you may omit "say" entirely).
- For filter_contacts / book_summary / call_next / batch_action, derive answers from the BOOK STATE above. Never invent ids — they must appear in BOOK STATE.
- For batch / write actions, your spoken line MUST confirm the count ("You want to text 7 contacts, right?").
- Match contacts by name fuzzy + context. If multiple match, use "clarify".
- Currency amounts ("twenty eight hundred", "$2,800") → integer 2800.

${REX_COPY_RULES}

${toneDirective}

The rep said:
"${transcript}"

Respond now: your spoken line first, then the \`\`\`json block.`;
}

// Every action type the executor knows how to handle. A brain reply with any
// other "action" value is coerced to a safe no-op `say` rather than letting an
// unknown type flow into executeAction.
const KNOWN_ACTION_TYPES: ReadonlySet<RexAction['type']> = new Set([
  'add_contact', 'update_notes', 'delete_contact', 'log_deal', 'schedule_followup',
  'retier_contact', 'create_reminder', 'show_contact', 'filter_contacts', 'book_summary',
  'call_next', 'batch_action', 'create_blast_sequence', 'analyze_stalled_leads',
  'schedule_nurture_blast', 'find_vehicles', 'chain', 'clarify', 'say',
]);

// P2-R3: the actions Rex may bundle into a chain. Read-only / heavyweight actions
// (filter, book_summary, blast, nurture, analyze, clarify, say, and a nested chain)
// are deliberately excluded — a chain is always a small set of confirmable writes.
const CHAINABLE_TYPES: ReadonlySet<RexAction['type']> = new Set([
  'add_contact', 'update_notes', 'delete_contact', 'log_deal',
  'schedule_followup', 'retier_contact', 'create_reminder', 'batch_action',
]);

// Coerce one raw brain step ({action|type, payload, say?}) into a real RexAction,
// or null if it isn't a permitted chainable write. This is what lets executeAction
// and summarizeAction treat chain steps as ordinary actions — they carry `type`.
function normalizeStep(raw: any): RexAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = String(raw.action ?? raw.type ?? '');
  if (!CHAINABLE_TYPES.has(t as RexAction['type'])) return null;
  return {
    type: t as RexAction['type'],
    payload: raw.payload ?? {},
    say: typeof raw.say === 'string' ? raw.say : '',
  } as RexAction;
}

// Build a chain action from a raw payload, dropping any non-chainable / nested
// steps. A chain that collapses to 0 real steps becomes a safe `say`; exactly 1
// real step unwraps to that lone action (no pointless confirm-as-chain).
function normalizeChain(rawPayload: any, say: string): RexAction {
  const rawSteps = Array.isArray(rawPayload?.steps) ? rawPayload.steps : [];
  const steps = rawSteps
    .map(normalizeStep)
    .filter((s: RexAction | null): s is RexAction => s !== null);
  if (steps.length === 0) return { type: 'say', payload: {} as any, say: say || "I didn't catch what to do." };
  if (steps.length === 1) return { ...steps[0], say: say || steps[0].say };
  return { type: 'chain', payload: { steps }, say } as RexAction;
}

function parseAction(raw: string): RexAction {
  if (!raw) return { type: 'say', payload: {} as any, say: "Sorry, I didn't catch that." };
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1] : raw;
  try {
    const obj = JSON.parse(jsonText.trim());
    if (typeof obj !== 'object' || !obj) throw new Error('not object');
    const rawType = String(obj.action ?? obj.type ?? 'say');
    const type = (KNOWN_ACTION_TYPES.has(rawType as RexAction['type']) ? rawType : 'say') as RexAction['type'];
    const say = typeof obj.say === 'string' ? obj.say : '';
    if (type === 'chain') return normalizeChain(obj.payload, say);
    const payload = type === 'say' ? {} : (obj.payload ?? {});
    return { type, payload, say } as RexAction;
  } catch {
    return {
      type: 'say',
      payload: {} as any,
      say: raw.length < 120 ? raw.trim() : "Sorry, I didn't follow that.",
    };
  }
}

export type RexInterpretOpts = {
  // Recent conversation turns (this session) so follow-ups like "text him too"
  // resolve against what was just said.
  recentTurns?: BrainMessage[];
  // Streams Rex's spoken line as it's generated (the text before the ```json).
  onSayDelta?: (spokenSoFar: string) => void;
  signal?: AbortSignal;
  // P2-R2: which tab the rep is on + the contact they have open, so Rex can
  // resolve deictic references ("this one", "log a deal on her") in context.
  activeScreen?: string;
  selectedContactId?: string | null;
};

// Everything before the first ```fence is Rex's spoken line (it's prompted to
// lead with it). Used both for live streaming and for the final say.
function spokenPortion(raw: string): string {
  const idx = raw.indexOf('```');
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim();
}

// P2-R4: actions that act on a single named contact. If the name the brain
// returned matches 2+ people in the book, we ask which one instead of guessing.
const CONTACT_REF_ACTIONS: ReadonlySet<RexAction['type']> = new Set([
  'update_notes', 'delete_contact', 'schedule_followup', 'show_contact', 'retier_contact',
]);

// Contacts plausibly referred to by `name`. An exact full-name match wins (so a
// precise "Maria Lopez" never trips the disambiguator); otherwise match on a
// name prefix or a shared first-name token (so a bare "Maria" surfaces every one).
function matchContactsByName(name: string, contacts: V2Contact[]): V2Contact[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const exact = contacts.filter(c => (c.name ?? '').trim().toLowerCase() === q);
  if (exact.length > 0) return exact;
  const firstTok = q.split(/\s+/)[0];
  return contacts.filter(c => {
    const full = (c.name ?? '').trim().toLowerCase();
    return full.startsWith(q) || full.split(/\s+/)[0] === firstTok;
  });
}

export async function rexInterpret(
  transcript: string,
  contacts: V2Contact[],
  tagNames: string[],
  opts: RexInterpretOpts = {},
): Promise<RexAction> {
  const [memory, book] = await Promise.all([
    getRexMemory(),
    loadBookContext(),
  ]);

  const bookSection = bookContextForPrompt(book);
  const prompt = buildPrompt(transcript, contacts, tagNames, memory?.summary ?? '', bookSection, buildScreenContext(opts, contacts));
  const raw = await callBrainStream({
    maxTokens: 800,
    signal: opts.signal,
    // P2-R7: Hey Rex voice is the latency-sensitive interactive path — request the
    // fast model tier. Inert until the edge function's BRAIN_TIERED flag is on.
    tier: 'fast',
    messages: [
      ...(opts.recentTurns ?? []),
      { role: 'user', content: prompt },
    ],
    onDelta: opts.onSayDelta
      ? (fullText) => opts.onSayDelta!(spokenPortion(fullText))
      : undefined,
  });
  const action = parseAction(raw);

  // Prefer the streamed spoken line as the say — it's what the rep already
  // heard and watched type out. (If Rex led straight with the fence, keep the
  // JSON say.)
  const spoken = spokenPortion(raw);
  if (spoken && (raw.includes('```') || action.type === 'say')) action.say = spoken;

  // Validate brain-supplied contact ids against the real book before any write:
  // filter blast targets down to ids that actually exist, so the sequence_steps
  // writer never sees a hallucinated/stale contact id.
  if (action.type === 'create_blast_sequence' && Array.isArray(action.payload.contact_ids)) {
    const known = new Set(contacts.map(c => c.id));
    action.payload.contact_ids = action.payload.contact_ids.filter(id => known.has(id));
  }

  // call_next is a "Rex picked" action, but the brain can drift on the
  // suggested_opener (copy rules are easy to break on auto-generated text).
  // Recompute locally for safety: hard-deterministic selection + opener
  // template that already obeys all the copy rules.
  if (action.type === 'call_next') {
    const tier = (action.payload as any)?.tier ?? 'hot';
    const pick = chooseNextCall(book, tier);
    if (pick) {
      return {
        type: 'call_next',
        payload: {
          contact_id: pick.contact.id,
          contact_name: pick.contact.name,
          reason: pick.reason,
          suggested_opener: pick.suggested_opener,
        },
        say: action.say || `Call ${pick.contact.name.split(' ')[0]} — ${pick.reason}`,
      };
    }
  }

  // P2-R4 never-guess: if a contact-referencing action names someone who matches
  // 2+ people in the book, ask which one instead of trusting the brain's single
  // pick. The brain is already told to clarify on collisions (see buildPrompt);
  // this is the client-side safety net for when it returns a short/ambiguous name
  // anyway. The single-match (and no-name) happy path is untouched.
  if (CONTACT_REF_ACTIONS.has(action.type)) {
    const nm = String((action.payload as any)?.contact_name ?? '').trim();
    if (nm) {
      const matches = matchContactsByName(nm, contacts);
      if (matches.length > 1) {
        const first = nm.split(/\s+/)[0];
        return {
          type: 'clarify',
          payload: {
            question: `I've got ${matches.length} matches for ${nm}. Which one?`,
            candidates: matches.slice(0, 6).map(c => ({ id: c.id, label: c.name })),
          },
          say: `I've got a few people named ${first}. Which one do you mean?`,
        };
      }
    }
  }

  // P2-R3 + P2-R4 never-guess for chains: a chain's top-level type is 'chain', so
  // the guard above never inspects its steps. Apply the same check to each
  // contact-referencing STEP — if any names someone matching 2+ people, clarify for
  // the whole chain instead of letting the brain's single guess run mid-chain.
  // (Reachable only when EXPO_PUBLIC_REX_MULTISTEP is on; 1-step chains already
  // unwrap to a lone action and re-enter the guard above.)
  if (action.type === 'chain') {
    for (const step of action.payload.steps ?? []) {
      if (!CONTACT_REF_ACTIONS.has(step.type)) continue;
      const nm = String((step.payload as any)?.contact_name ?? '').trim();
      if (!nm) continue;
      const matches = matchContactsByName(nm, contacts);
      if (matches.length > 1) {
        const first = nm.split(/\s+/)[0];
        return {
          type: 'clarify',
          payload: {
            question: `I've got ${matches.length} matches for ${nm}. Which one?`,
            candidates: matches.slice(0, 6).map(c => ({ id: c.id, label: c.name })),
          },
          say: `I've got a few people named ${first}. Which one do you mean before I run that?`,
        };
      }
    }
  }

  return action;
}

const HEAT_TIER_SCORE = { hot: 90, warm: 65, cold: 35 } as const;

export async function executeAction(action: RexAction, contacts: V2Contact[] = []): Promise<{ ok: boolean; openContactId?: string; filteredIds?: string[] }> {
  switch (action.type) {
    case 'add_contact': {
      const p = action.payload;
      const id = await createContact({
        firstName: p.first_name,
        lastName: p.last_name ?? '',
        phone: p.phone ?? '',
        vehicle: p.vehicle ?? '',
        trim: '',
        budget: p.budget ?? '',
        tradeIn: p.trade_in ?? '',
        planLabel: (p.plan_label as any) ?? 'THIS WEEK',
        heatScore: HEAT_TIER_SCORE[p.heat_tier ?? 'warm'],
        notes: p.notes ?? '',
        tags: [],
      });
      return { ok: true, openContactId: id };
    }
    case 'update_notes': {
      const p = action.payload;
      const { data } = await supabase
        .from('contacts')
        .select('notes')
        .eq('id', p.contact_id)
        .maybeSingle();
      const existing = (data?.notes ?? '').trim();
      const joined = existing
        ? `${existing}\n\n${p.notes_append}`
        : p.notes_append;
      await updateContactNotes(p.contact_id, joined);
      return { ok: true, openContactId: p.contact_id };
    }
    case 'delete_contact': {
      await deleteContact(action.payload.contact_id);
      return { ok: true };
    }
    case 'log_deal': {
      const p = action.payload;
      const today = new Date().toISOString().slice(0, 10);
      // Drop a hallucinated contact_id (not in the rep's book) so we never write
      // a bad FK — the deal still logs, just unlinked. Only enforced when a book
      // was passed in to validate against.
      const validContactId =
        p.contact_id && contacts.length > 0 && !contacts.some(c => c.id === p.contact_id)
          ? null
          : (p.contact_id ?? null);
      const draft: DealDraft = {
        name: p.customer_name,
        stock: p.stock,
        vehicle: p.vehicle,
        date: p.date ?? today,
        type: p.type ?? 'NEW',
        funding: p.funding ?? 'finance',
        frontGross: Number(p.front_gross) || 0,
        backGross: Number(p.back_gross) || 0,
        split: false,
        splitWith: '',
        contactId: validContactId,
      };
      await insertDeal(draft);
      return { ok: true };
    }
    case 'schedule_followup': {
      const p = action.payload;
      const date = new Date();
      date.setDate(date.getDate() + Math.max(0, Number(p.days_from_now) || 0));
      const iso = date.toISOString().slice(0, 10);
      const { error } = await supabase
        .from('contacts')
        .update({
          next_followup_date: iso,
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.contact_id);
      if (error) throw error;
      return { ok: true, openContactId: p.contact_id };
    }
    case 'retier_contact': {
      const p = action.payload;
      await updateContactTier(p.contact_id, p.tier);
      return { ok: true, openContactId: p.contact_id };
    }
    case 'create_reminder': {
      const p = action.payload;
      await createReminder({
        title: p.title,
        dueAt: p.due_at,
        contactId: p.contact_id ?? null,
        body: p.body ?? null,
      });
      return { ok: true };
    }
    case 'show_contact': {
      return { ok: true, openContactId: action.payload.contact_id };
    }
    case 'filter_contacts': {
      // No write. The UI surfaces the filtered list via filteredIds.
      return { ok: true, filteredIds: action.payload.contact_ids ?? [] };
    }
    case 'book_summary': {
      // Pure display — no write.
      return { ok: true };
    }
    case 'call_next': {
      // Single-contact pivot — UI opens the contact card.
      return { ok: true, openContactId: action.payload.contact_id };
    }
    case 'batch_action': {
      const p = action.payload;
      await executeBatchAction(p.action, p.contact_ids, p.payload ?? {}, contacts);
      return { ok: true };
    }
    case 'create_blast_sequence': {
      // No DB write here — the UI takes over and runs the drafter / SMS flow.
      // Returning ok=true marks the action as accepted; AppShell catches the
      // type and mounts BlastSequenceDrafter.
      return { ok: true };
    }
    case 'analyze_stalled_leads': {
      // Pure analysis pivot — AppShell catches the type and opens
      // StalledLeadsAnalysis. No DB write here.
      return { ok: true };
    }
    case 'schedule_nurture_blast': {
      // AppShell catches the type, runs scheduleNurtureBlast (which writes
      // pending nurture_messages rows), and opens NurtureReviewer.
      return { ok: true };
    }
    case 'find_vehicles': {
      // Read-only pivot — no DB write. useHeyRex auto-runs it and AppShell
      // (flag-gated) opens VehicleFinderModal pre-filled with the payload.
      return { ok: true };
    }
    case 'chain': {
      // Run each normalized step in order, stopping at the first failure so we
      // never silently half-apply past an error. parseAction guarantees steps are
      // permitted chainable writes (no nested chains), so a plain loop is safe.
      let last: { ok: boolean; openContactId?: string; filteredIds?: string[] } = { ok: true };
      for (const step of action.payload.steps ?? []) {
        last = await executeAction(step, contacts);
        if (!last.ok) return last;
      }
      return last;
    }
    case 'clarify':
    case 'say':
    default:
      return { ok: true };
  }
}

export function summarizeAction(action: RexAction): string {
  const p = action.payload as any;
  switch (action.type) {
    case 'add_contact':
      return `Add ${p.first_name}${p.last_name ? ' ' + p.last_name : ''}${p.vehicle ? ` · ${p.vehicle}` : ''}${p.phone ? ` · ${p.phone}` : ''}`;
    case 'update_notes':
      return `Append note to ${p.contact_name}: “${truncate(p.notes_append, 60)}”`;
    case 'delete_contact':
      return `Delete ${p.contact_name}`;
    case 'log_deal':
      return `Log deal — ${p.customer_name} · ${p.stock} · ${p.vehicle} · $${Number(p.front_gross).toLocaleString()} front / $${Number(p.back_gross).toLocaleString()} back`;
    case 'schedule_followup':
      return `Follow up with ${p.contact_name} in ${p.days_from_now} day${p.days_from_now === 1 ? '' : 's'}`;
    case 'retier_contact':
      return `Move ${p.contact_name} to ${String(p.tier ?? '').toUpperCase()}${p.reason ? ` · ${p.reason}` : ''}`;
    case 'create_reminder': {
      const due = p.due_at ? new Date(p.due_at) : null;
      const when = due && !Number.isNaN(due.getTime())
        ? due.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
        : '';
      return `Remind you${p.contact_name ? ` about ${p.contact_name}` : ''}: ${p.title}${when ? ` · ${when}` : ''}`;
    }
    case 'show_contact':
      return `Open ${p.contact_name}`;
    case 'filter_contacts':
      return `${p.filter_summary ?? 'Filtered'} · ${p.matched_count ?? (p.contact_ids?.length ?? 0)} match${(p.matched_count ?? p.contact_ids?.length) === 1 ? '' : 'es'}`;
    case 'book_summary': {
      const t = p.by_tier ?? {};
      return `${p.total ?? 0} contacts · ${t.hot ?? 0} hot · ${t.warm ?? 0} warm · ${p.stalled ?? 0} stalled`;
    }
    case 'call_next':
      return `Call ${p.contact_name} — ${p.reason ?? ''}`;
    case 'batch_action':
      return `${labelFor(p.action)} ${p.count ?? p.contact_ids?.length ?? 0} contacts`;
    case 'create_blast_sequence':
      return `Blast ${p.contact_ids?.length ?? 0} contacts · ${p.filter_summary ?? p.filter_criteria ?? ''}`;
    case 'analyze_stalled_leads':
      return `Analyze stalled leads (≥${p.days_silent_threshold ?? 14}d silent)`;
    case 'schedule_nurture_blast':
      return `Nurture blast · ${p.trigger?.replace('_', ' ')} · ${p.audience?.replace('_', ' ')}`;
    case 'find_vehicles': {
      const r = (p.requirements ?? {}) as Record<string, any>;
      const bits = [
        r.vehicle_type ? String(r.vehicle_type).toUpperCase() : null,
        r.monthly_budget ? `$${r.monthly_budget}/mo` : null,
        r.min_seats ? `${r.min_seats}+ seats` : null,
        r.features?.length ? `${r.features.length} feature${r.features.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      return `Find vehicles${bits.length ? ' · ' + bits.join(' · ') : ''}`;
    }
    case 'chain': {
      const steps = (p.steps ?? []) as RexAction[];
      return steps.map((s, i) => `${i + 1}. ${summarizeAction(s)}`).join('\n');
    }
    case 'clarify':
      return p.question ?? 'Need clarification';
    case 'say':
    default:
      return '';
  }
}

// P2-R8: an honest, specific recovery line for an action that FAILED to execute.
// Rex speaks its spoken confirmation optimistically (before the write runs), so on
// a failure the rep already heard "done" — this names exactly what did NOT happen
// and offers a retry, so Rex never leaves a fabricated success standing. Used only
// when the failure-honesty flag is on (it alters spoken output).
export function failureRecoveryLine(action: RexAction): string {
  const p = action.payload as any;
  const who = (n: unknown, fallback: string) => (typeof n === 'string' && n.trim() ? n.trim() : fallback);
  switch (action.type) {
    case 'add_contact':
      return `That didn't save — I couldn't add ${who(p.first_name, 'that contact')}. Want me to try again?`;
    case 'log_deal':
      return `That didn't save — the deal for ${who(p.customer_name, 'that customer')} didn't go through. Want me to try again?`;
    case 'update_notes':
      return `That didn't save — I couldn't update ${who(p.contact_name, 'that contact')}. Want me to try again?`;
    case 'delete_contact':
      return `That didn't go through — ${who(p.contact_name, 'that contact')} is still here. Want me to try again?`;
    case 'schedule_followup':
      return `That didn't save — the follow-up for ${who(p.contact_name, 'that contact')} didn't set. Want me to try again?`;
    case 'retier_contact':
      return `That didn't save — I couldn't move ${who(p.contact_name, 'that contact')}. Want me to try again?`;
    case 'create_reminder':
      return `That didn't save — the reminder didn't set. Want me to try again?`;
    case 'batch_action':
      return `That didn't go through — the batch update didn't apply. Want me to try again?`;
    case 'chain':
      return `That didn't fully go through — not all of those steps saved. Want me to try again?`;
    // Read-only / display actions don't "save" anything — a failure there is just a
    // lookup that didn't load, so use softer, accurate wording.
    case 'filter_contacts':
    case 'book_summary':
    case 'call_next':
    case 'show_contact':
    case 'find_vehicles':
      return `Couldn't pull that up. Want me to try again?`;
    default:
      return `That didn't go through. Want me to try again?`;
  }
}

function labelFor(action: string): string {
  return ({
    add_tag: 'Tag',
    mark_dead: 'Mark dead',
    mark_active: 'Reactivate',
    archive: 'Archive',
  } as Record<string, string>)[action] ?? action;
}

function truncate(s: string, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Parser for the Rex Coach chat: the reply is the spoken/coaching text, and —
// only when the rep clearly asked for a supported action — an optional fenced
// ```json action block after it. Returns the spoken text plus the parsed action
// (or null for a pure-coaching reply). The caller decides whether to act
// (RexCoach gates on actionWritesData + its allow-list, then shows Confirm).
export function parseCoachReply(raw: string): { spoken: string; action: RexAction | null } {
  const text = raw ?? '';
  const fenceIdx = text.indexOf('```');
  const spoken = (fenceIdx >= 0 ? text.slice(0, fenceIdx) : text).trim();
  const fence = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  if (!fence) return { spoken, action: null };
  try {
    const obj = JSON.parse(fence[1].trim());
    const type = (obj.action ?? obj.type) as RexAction['type'] | undefined;
    if (!type || type === 'say') return { spoken, action: null };
    return {
      spoken,
      action: { type, payload: obj.payload ?? {}, say: typeof obj.say === 'string' ? obj.say : '' } as RexAction,
    };
  } catch {
    return { spoken, action: null };
  }
}

export function actionWritesData(t: RexAction['type']): boolean {
  return (
    t === 'add_contact' ||
    t === 'update_notes' ||
    t === 'delete_contact' ||
    t === 'log_deal' ||
    t === 'schedule_followup' ||
    t === 'retier_contact' ||
    t === 'create_reminder' ||
    t === 'batch_action' ||
    t === 'create_blast_sequence' ||
    t === 'analyze_stalled_leads' ||
    t === 'schedule_nurture_blast' ||
    t === 'chain'
  );
}

// Log every executed/cancelled action for the rep behavior tracker.
export async function logRexAction(
  action: RexAction,
  // P2-R8: 'partial' (already permitted by the rex_action_log CHECK, previously
  // unused) marks a chain that didn't fully apply — distinct from an outright 'failed'.
  result: 'success' | 'cancelled' | 'partial' | 'failed',
  // P2-R8: failure_reason captures WHY a write failed. The table has no dedicated
  // column (adding one is an owner-gated migration), so we fold it into the
  // existing action_payload jsonb under `_rex_failure_reason` (clamped) — additive,
  // no schema change, queryable. Always recorded; it never alters user-facing output.
  extra?: { contact_ids?: string[]; failure_reason?: string },
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const contactIds =
      extra?.contact_ids ??
      ((action.payload as any)?.contact_ids as string[] | undefined) ??
      ((action.payload as any)?.contact_id ? [(action.payload as any).contact_id] : undefined);
    const reason = extra?.failure_reason ? String(extra.failure_reason).slice(0, 300) : null;
    const payload = reason
      ? { ...(action.payload as any), _rex_failure_reason: reason }
      : action.payload;
    await supabase.from('rex_action_log').insert({
      user_id: user.id,
      action_type: action.type,
      action_payload: payload as any,
      contact_ids: contactIds ?? null,
      confirmed_at: result === 'success' ? new Date().toISOString() : null,
      executed_at: result === 'success' ? new Date().toISOString() : null,
      result,
    });
  } catch {
    /* logging failure shouldn't block the user */
  }
}
