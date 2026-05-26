// Rex tool-use mode. Given a transcript and the user's contacts/tags,
// asks ai-proxy/brain to choose an action + payload + spoken confirmation.
//
// The brain returns a single JSON object in a fenced code block. We parse
// it loosely; if Rex couldn't pick a structured action it falls back to a
// 'say' action that just speaks back to the rep without writing anything.

import { supabase } from '@/lib/supabase';
import { createContact, updateContactNotes, deleteContact } from './updateContact';
import { insertDeal, type DealDraft } from './dealLogger';
import type { V2Contact } from './useContacts';

const AI_PROXY_URL = 'https://fwvrauqdoevwmwwqlfav.supabase.co/functions/v1/ai-proxy';

export type RexAction =
  | { type: 'add_contact'; payload: AddContactPayload; say: string }
  | { type: 'update_notes'; payload: UpdateNotesPayload; say: string }
  | { type: 'delete_contact'; payload: DeleteContactPayload; say: string }
  | { type: 'log_deal'; payload: LogDealPayload; say: string }
  | { type: 'schedule_followup'; payload: ScheduleFollowupPayload; say: string }
  | { type: 'show_contact'; payload: ShowContactPayload; say: string }
  | { type: 'clarify'; payload: ClarifyPayload; say: string }
  | { type: 'say'; payload: Record<string, never>; say: string };

export type AddContactPayload = {
  first_name: string;
  last_name?: string;
  phone?: string;
  vehicle?: string;
  budget?: string;
  trade_in?: string;
  notes?: string;
  heat_tier?: 'hot' | 'warm' | 'watch';
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

export type ShowContactPayload = {
  contact_id: string;
  contact_name: string;
};

export type ClarifyPayload = {
  question: string;
  candidates?: Array<{ id: string; label: string }>;
};

function buildPrompt(transcript: string, contacts: V2Contact[], tags: string[]): string {
  const contactList = contacts.slice(0, 80).map(c =>
    `- ${c.name} (id: ${c.id})${c.vehicle ? ` · ${c.vehicle}` : ''}`
  ).join('\n');
  const tagList = tags.join(', ') || '(none)';
  return `You are Rex, the voice assistant inside PocketRep — a sales rep CRM. The rep just said something to you. Pick the single best action.

Actions you can take, with required + optional payload fields:

1. add_contact — create a brand new contact
   payload: { first_name (req), last_name?, phone?, vehicle?, budget?, trade_in?, notes?, heat_tier? ("hot"|"warm"|"watch"), plan_label? ("TODAY"|"THIS WEEK"|"THIS MONTH"|"NEXT QTR") }

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

7. clarify — the rep's request is ambiguous (e.g. two contacts share a name); ask back
   payload: { question, candidates?: [{id, label}] }

8. say — informational reply, no write
   payload: {}

CURRENT CONTACTS (you can only reference ids from this list):
${contactList}

EXISTING TAGS the rep uses: ${tagList}

RULES:
- Return ONLY a single JSON object inside a \`\`\`json fenced block. No prose outside.
- Match contacts by name fuzzy + context. If multiple match, use "clarify".
- Currency amounts ("twenty eight hundred", "$2,800") → integer 2800.
- "Marcus" matches "Marcus Holloway" if only one Marcus exists.
- If the rep is asking for info you don't have, use "say" and answer briefly.
- The "say" field is what you'll speak back to the rep. Keep it under 15 words, conversational.

The rep said:
"${transcript}"

Respond now with the JSON only.`;
}

function parseAction(raw: string): RexAction {
  if (!raw) return { type: 'say', payload: {} as any, say: "Sorry, I didn't catch that." };
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1] : raw;
  try {
    const obj = JSON.parse(jsonText.trim());
    if (typeof obj !== 'object' || !obj) throw new Error('not object');
    const type = (obj.action ?? obj.type ?? 'say') as RexAction['type'];
    const say = typeof obj.say === 'string' ? obj.say : '';
    const payload = obj.payload ?? {};
    return { type, payload, say } as RexAction;
  } catch {
    return {
      type: 'say',
      payload: {} as any,
      say: raw.length < 120 ? raw.trim() : "Sorry, I didn't follow that.",
    };
  }
}

export async function rexInterpret(
  transcript: string,
  contacts: V2Contact[],
  tagNames: string[],
): Promise<RexAction> {
  const res = await fetch(`${AI_PROXY_URL}/brain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 600,
      messages: [{ role: 'user', content: buildPrompt(transcript, contacts, tagNames) }],
    }),
  });
  if (!res.ok) throw new Error(`ai-proxy ${res.status}`);
  const json = await res.json();
  const raw = json.content?.[0]?.text ?? json.text ?? '';
  return parseAction(raw);
}

const HEAT_TIER_SCORE = { hot: 90, warm: 65, watch: 35 } as const;

export async function executeAction(action: RexAction): Promise<{ ok: boolean; openContactId?: string }> {
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
        contactId: p.contact_id ?? null,
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
    case 'show_contact': {
      return { ok: true, openContactId: action.payload.contact_id };
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
    case 'show_contact':
      return `Open ${p.contact_name}`;
    case 'clarify':
      return p.question ?? 'Need clarification';
    case 'say':
    default:
      return '';
  }
}

function truncate(s: string, n: number) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function actionWritesData(t: RexAction['type']): boolean {
  return t === 'add_contact' || t === 'update_notes' || t === 'delete_contact' || t === 'log_deal' || t === 'schedule_followup';
}
