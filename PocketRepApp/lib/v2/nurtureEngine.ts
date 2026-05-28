// Nurture Engine. Generates per-contact nurture drafts for dead/dormant/past
// customers, respecting:
//   - Cadence rules (max 1 nurture / 30 days, skip 60 days after a reply,
//     skip permanently if do_not_contact, 6-month pause after negative reply)
//   - Variety rules (no repeat of last 3 hooks_used)
//
// V1: drafts are written into public.nurture_messages with sent_at=null,
// scheduled_for=now. Rep reviews in NurtureReviewer, taps Send per row,
// each row fires via smsLauncher and gets sent_at filled in.

import { supabase } from '@/lib/supabase';
import { REX_COPY_RULES } from './rexActions';
import { loadBookContext, type BookContact } from './bookContext';
import { callBrain } from './aiProxy';

export type NurtureAudience = 'dead' | 'dormant' | 'past_customers' | 'all_inactive';
export type NurtureTrigger =
  | 'holiday'
  | 'quarterly_check_in'
  | 'custom';

export type PendingNurture = {
  id: string;
  contact_id: string;
  contact_name: string;
  message_text: string;
  language: 'en' | 'es';
  hook_used: string;
  pitch_intensity: 'none' | 'low' | 'medium' | 'high';
  trigger_type: string;
  scheduled_for: string | null;
  phone: string | null;
};

export type NurtureBlastResult = {
  drafted_count: number;
  skipped_count: number;
  skip_reasons: {
    do_not_contact: number;
    recent_nurture: number;
    recent_reply: number;
    negative_pause: number;
  };
  scheduled_for: string;
  drafts: PendingNurture[];
};

type EligibilityRow = {
  contact_id: string;
  last_nurture_at: string | null;
  last_reply_at: string | null;
  last_reply_sentiment: string | null;
  last_3_hooks: string[];
};

async function loadEligibility(contactIds: string[]): Promise<Map<string, EligibilityRow>> {
  const out = new Map<string, EligibilityRow>();
  if (contactIds.length === 0) return out;
  for (const id of contactIds) {
    out.set(id, { contact_id: id, last_nurture_at: null, last_reply_at: null, last_reply_sentiment: null, last_3_hooks: [] });
  }
  const { data } = await supabase
    .from('nurture_messages')
    .select('contact_id,sent_at,reply_received,reply_sentiment,hook_used,created_at')
    .in('contact_id', contactIds)
    .order('created_at', { ascending: false });
  for (const row of (data ?? []) as any[]) {
    const e = out.get(row.contact_id);
    if (!e) continue;
    if (row.sent_at && !e.last_nurture_at) e.last_nurture_at = row.sent_at;
    if (row.reply_received && !e.last_reply_at) {
      e.last_reply_at = row.sent_at ?? row.created_at;
      e.last_reply_sentiment = row.reply_sentiment ?? null;
    }
    if (row.hook_used && e.last_3_hooks.length < 3) e.last_3_hooks.push(row.hook_used);
  }
  return out;
}

function daysAgo(iso: string | null): number {
  if (!iso) return 9999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

type EligibilityVerdict = { ok: true } | { ok: false; reason: 'do_not_contact' | 'recent_nurture' | 'recent_reply' | 'negative_pause' };

function checkEligibility(c: BookContact, e: EligibilityRow): EligibilityVerdict {
  if (c.do_not_contact) return { ok: false, reason: 'do_not_contact' };
  if (e.last_nurture_at && daysAgo(e.last_nurture_at) < 30) return { ok: false, reason: 'recent_nurture' };
  if (e.last_reply_at && daysAgo(e.last_reply_at) < 60) return { ok: false, reason: 'recent_reply' };
  if (e.last_reply_sentiment === 'negative' && (!e.last_reply_at || daysAgo(e.last_reply_at) < 180)) {
    return { ok: false, reason: 'negative_pause' };
  }
  return { ok: true };
}

function selectAudience(audience: NurtureAudience): (c: BookContact) => boolean {
  switch (audience) {
    case 'dead':
      return c => c.rep_decision === 'dead' || c.rep_decision === 'kill' || c.heat_score < 20;
    case 'dormant':
      return c => c.heat_score >= 20 && c.heat_score < 50 && c.days_silent > 30;
    case 'past_customers':
      return c => c.is_past_customer;
    case 'all_inactive':
      return c =>
        c.rep_decision === 'dead' || c.rep_decision === 'kill' || c.heat_score < 20 ||
        c.is_past_customer ||
        (c.heat_score < 50 && c.days_silent > 30);
  }
}

function buildPrompt(
  contacts: Array<BookContact & { hooks_to_avoid: string[] }>,
  trigger: NurtureTrigger,
  toneGuidance: string,
  pitchIntensity: string,
  customIntent: string | undefined,
): string {
  const rows = contacts.map(c => JSON.stringify({
    id: c.id,
    name: c.name,
    vehicle_model: c.vehicle_model ?? c.vehicle,
    vehicle_year: c.vehicle,
    last_contact_summary: c.last_contact_summary,
    preferred_language: c.preferred_language,
    is_past_customer: c.is_past_customer,
    hooks_to_avoid: c.hooks_to_avoid,
  })).join(',\n');

  return `You are Rex generating a ${trigger} nurture message for each contact below.

Trigger details:
${customIntent ? `Custom intent: ${customIntent}` : toneGuidance}

Pitch intensity for this trigger: ${pitchIntensity}
- none = pure relationship, no CTA
- low = soft mention of the dealership / inventory
- medium = clear but casual CTA
- high = direct sale-driving line

For each contact:
1. Acknowledge the trigger in ONE line, then pivot to a personal angle.
2. Hook into ONE of: personal_detail, vehicle_interest, calendar_event, past_purchase, holiday, pricing, inventory, rapport.
3. NEVER use any hook listed in that contact's hooks_to_avoid.
4. Past customers get warmer tone ("hope the [vehicle] is treating you good").
5. Dead leads — acknowledge the gap softly, no guilt.
6. Spanish rewrite (Mexican slang) if preferred_language is "es".

${REX_COPY_RULES}

CONTACTS:
[
${rows}
]

Return ONLY a single JSON object inside a \`\`\`json fenced block:
{
  "messages": [
    {
      "contact_id": "...",
      "message": "the draft",
      "language": "en" | "es",
      "hook_used": "personal_detail" | "vehicle_interest" | "calendar_event" | "past_purchase" | "holiday" | "pricing" | "inventory" | "rapport",
      "char_count": <number>
    }
  ]
}`;
}

async function fetchHolidayContext(): Promise<{ name: string; tone: string; pitch: string } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('holiday_calendar')
    .select('holiday_name,tone_guidance,pitch_intensity')
    .eq('holiday_date', today)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.holiday_name as string,
    tone: (data.tone_guidance as string) ?? '',
    pitch: (data.pitch_intensity as string) ?? 'low',
  };
}

export async function scheduleNurtureBlast({
  trigger,
  audience,
  customIntent,
  scheduledFor = new Date(),
  maxPerRep = 50,
}: {
  trigger: NurtureTrigger;
  audience: NurtureAudience;
  customIntent?: string;
  scheduledFor?: Date;
  maxPerRep?: number;
}): Promise<NurtureBlastResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const book = await loadBookContext();
  const all = [
    ...book.dead, ...book.cold, ...book.watch,
    ...book.past_customers,
  ];
  // de-dup
  const seen = new Set<string>();
  const audienceFilter = selectAudience(audience);
  const candidates = all.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return audienceFilter(c);
  });

  const elig = await loadEligibility(candidates.map(c => c.id));
  const skipReasons = { do_not_contact: 0, recent_nurture: 0, recent_reply: 0, negative_pause: 0 };
  const passing: Array<BookContact & { hooks_to_avoid: string[] }> = [];

  for (const c of candidates) {
    const e = elig.get(c.id) ?? { contact_id: c.id, last_nurture_at: null, last_reply_at: null, last_reply_sentiment: null, last_3_hooks: [] };
    const verdict = checkEligibility(c, e);
    if (!verdict.ok) {
      skipReasons[verdict.reason] += 1;
      continue;
    }
    passing.push({ ...c, hooks_to_avoid: e.last_3_hooks });
    if (passing.length >= maxPerRep) break;
  }

  if (passing.length === 0) {
    return {
      drafted_count: 0,
      skipped_count: candidates.length,
      skip_reasons: skipReasons,
      scheduled_for: scheduledFor.toISOString(),
      drafts: [],
    };
  }

  let toneGuidance = customIntent ?? 'Generic nurture check-in.';
  let pitchIntensity = 'low';
  if (trigger === 'holiday') {
    const h = await fetchHolidayContext();
    if (h) {
      toneGuidance = `${h.name}: ${h.tone}`;
      pitchIntensity = h.pitch;
    }
  } else if (trigger === 'quarterly_check_in') {
    toneGuidance = 'Quarterly check-in. Light, no agenda. Stay top of mind.';
    pitchIntensity = 'low';
  }

  // Brain call: one message per contact
  const raw = await callBrain({
    maxTokens: 2500,
    messages: [{
      role: 'user',
      content: buildPrompt(passing, trigger, toneGuidance, pitchIntensity, customIntent),
    }],
  });
  const fence = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  let messages: any[] = [];
  try {
    const obj = JSON.parse((fence ? fence[1] : raw).trim());
    messages = Array.isArray(obj.messages) ? obj.messages : [];
  } catch { /* leave empty */ }

  // Build phone lookup
  const phoneById = new Map<string, string | null>();
  {
    const { data } = await supabase
      .from('contacts')
      .select('id,phone')
      .in('id', passing.map(p => p.id));
    for (const r of (data ?? []) as any[]) phoneById.set(r.id, r.phone);
  }

  // Insert into nurture_messages as pending_review (scheduled_for=now,
  // sent_at=null). Rep reviews + taps Send per row in NurtureReviewer.
  const inserts = messages.map((m: any) => ({
    user_id: user.id,
    contact_id: String(m.contact_id ?? ''),
    message_text: String(m.message ?? ''),
    language: m.language === 'es' ? 'es' : 'en',
    hook_used: String(m.hook_used ?? 'rapport'),
    trigger_type: trigger,
    pitch_intensity: pitchIntensity,
    scheduled_for: scheduledFor.toISOString(),
    sent_at: null,
  })).filter(r => r.contact_id && r.message_text);

  if (inserts.length === 0) {
    return {
      drafted_count: 0,
      skipped_count: candidates.length,
      skip_reasons: skipReasons,
      scheduled_for: scheduledFor.toISOString(),
      drafts: [],
    };
  }

  const { data: saved, error: insErr } = await supabase
    .from('nurture_messages')
    .insert(inserts)
    .select('id,contact_id,message_text,language,hook_used,pitch_intensity,trigger_type,scheduled_for');
  if (insErr) throw insErr;

  const passingById = new Map(passing.map(p => [p.id, p]));
  const drafts: PendingNurture[] = (saved ?? []).map((s: any) => {
    const c = passingById.get(s.contact_id);
    return {
      id: s.id,
      contact_id: s.contact_id,
      contact_name: c?.name ?? '—',
      message_text: s.message_text,
      language: s.language,
      hook_used: s.hook_used,
      pitch_intensity: s.pitch_intensity,
      trigger_type: s.trigger_type,
      scheduled_for: s.scheduled_for,
      phone: phoneById.get(s.contact_id) ?? null,
    };
  });

  return {
    drafted_count: drafts.length,
    skipped_count: candidates.length - drafts.length,
    skip_reasons: skipReasons,
    scheduled_for: scheduledFor.toISOString(),
    drafts,
  };
}

// Read pending nurture drafts (sent_at=null) for the current rep — used by
// the Heat Sheet banner + NurtureReviewer.
export async function loadPendingNurtures(): Promise<PendingNurture[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('nurture_messages')
    .select('id,contact_id,message_text,language,hook_used,pitch_intensity,trigger_type,scheduled_for,contacts!inner(first_name,last_name,phone)')
    .eq('user_id', user.id)
    .is('sent_at', null)
    .order('scheduled_for', { ascending: true });
  return (data ?? []).map((r: any) => ({
    id: r.id,
    contact_id: r.contact_id,
    contact_name: `${r.contacts?.first_name ?? ''} ${r.contacts?.last_name ?? ''}`.trim() || '—',
    message_text: r.message_text,
    language: r.language,
    hook_used: r.hook_used,
    pitch_intensity: r.pitch_intensity,
    trigger_type: r.trigger_type,
    scheduled_for: r.scheduled_for,
    phone: r.contacts?.phone ?? null,
  }));
}

export async function markNurtureSent(id: string): Promise<void> {
  await supabase
    .from('nurture_messages')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id);
}

export async function dismissNurture(id: string): Promise<void> {
  // V1: dismiss = soft-delete by stamping sent_at without firing SMS.
  // (We don't yet have a `dismissed_at` column.)
  await supabase
    .from('nurture_messages')
    .update({ sent_at: new Date().toISOString(), reply_received: false })
    .eq('id', id);
}

// Count pending nurtures + count of contacts whose last sent nurture has no
// reply marking yet (Heat Sheet "replies to review" banner).
export async function countNurtureBanners(): Promise<{
  pending_drafts: number;
  awaiting_reply_mark: number;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { pending_drafts: 0, awaiting_reply_mark: 0 };

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [pendingRes, awaitingRes] = await Promise.all([
    supabase
      .from('nurture_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('sent_at', null),
    supabase
      .from('nurture_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('sent_at', 'is', null)
      .eq('reply_received', false)
      .gte('sent_at', sevenDaysAgo),
  ]);

  return {
    pending_drafts: pendingRes.count ?? 0,
    awaiting_reply_mark: awaitingRes.count ?? 0,
  };
}
