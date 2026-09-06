import { supabase } from '@/lib/supabase';
import { callBrain } from './aiProxy';

export type WeeklyDigest = {
  id: string;
  week_start: string;
  units: number;
  commission: number;
  gross: number;
  contacts_added: number;
  contacts_touched: number;
  summary: string;
  highlights: string;
  generated_at: string;
};

// Local YYYY-MM-DD. NOT toISOString().slice(0,10): for any rep in a negative-UTC
// offset (i.e. the Americas), a Monday-evening local time serializes to a UTC
// Tuesday, which would shift the whole week window forward a day.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoMondayDate(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoMonday(d: Date): string {
  return ymd(isoMondayDate(d));
}

// The Monday of the week the rep should be REVIEWING right now. The digest is a
// look-back at a completed Mon–Sun week:
//   • Sunday      → the week wrapping up today (becomes available Sunday morning)
//   • Mon–Sat     → the prior, fully-completed week
// So a Monday-morning open reviews the week that just ended, and the target rolls
// forward one week every Sunday.
export function reviewWeekStart(today = new Date()): string {
  const monday = isoMondayDate(today);
  if (today.getDay() === 0) return ymd(monday); // Sunday: the week ending today
  monday.setDate(monday.getDate() - 7);          // Mon–Sat: prior completed week
  return ymd(monday);
}

export async function getLatestDigest(): Promise<WeeklyDigest | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('weekly_digests')
    .select('*')
    .eq('user_id', user.id)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as WeeklyDigest | null;
}

// Build (or rebuild) the digest for a specific Mon-start week. This is REVIEW
// ONLY: it reads deals + contacts and writes a single weekly_digests row. It
// never edits contacts, deals, tiers, or notes.
export async function generateDigestForWeek(weekStart: string): Promise<WeeklyDigest | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const weekStartDate = new Date(weekStart + 'T00:00:00');
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = ymd(weekEndDate);

  // Pull deals + contacts touched in that range. Scope to user_id explicitly
  // (as getLatestDigest does) rather than relying on RLS alone for the counts.
  const [dealsRes, contactsRes] = await Promise.all([
    supabase
      .from('deals')
      .select('amount,front_gross,back_gross,split,vehicle,title,closed_at')
      .eq('user_id', user.id)
      .gte('closed_at', weekStart)
      .lt('closed_at', weekEnd),
    supabase
      .from('contacts')
      .select('id,first_name,last_name,created_at,last_contact_date')
      .eq('user_id', user.id)
      .eq('is_deleted', false),
  ]);

  // A failed read must never fall through to an empty array — that would let
  // a transient error silently overwrite an already-correct digest with a
  // zeroed one below (this function always upserts).
  if (dealsRes.error) throw dealsRes.error;
  if (contactsRes.error) throw contactsRes.error;
  const deals = dealsRes.data ?? [];
  const contacts = contactsRes.data ?? [];

  const units = deals.reduce((s, d: any) => s + (d.split ? 0.5 : 1), 0);
  const commission = deals.reduce((s, d: any) => s + Number(d.amount ?? 0), 0);
  const gross = deals.reduce((s, d: any) => s + Number(d.front_gross ?? 0) + Number(d.back_gross ?? 0), 0);
  const contactsAdded = contacts.filter((c: any) => c.created_at >= weekStart && c.created_at < weekEnd).length;
  const contactsTouched = contacts.filter((c: any) => c.last_contact_date && c.last_contact_date >= weekStart && c.last_contact_date < weekEnd).length;

  const summary = `${units.toFixed(units % 1 === 0 ? 0 : 1)} unit${units === 1 ? '' : 's'} · $${commission.toLocaleString()} commission · $${gross.toLocaleString()} gross.`;

  let highlights = '';
  try {
    const prompt = `You're Rex, summarizing one sales rep's week.

Stats:
- Units: ${units}
- Commission: $${commission}
- Gross: $${gross}
- New contacts: ${contactsAdded}
- Contacts touched: ${contactsTouched}
- Deals this week: ${deals.map((d: any) => `${d.title ?? '?'} (${d.vehicle ?? '?'}, $${d.amount})`).join('; ') || '(none)'}

Write 2-4 short bullets — what went well, what needs attention next week, one specific suggestion. Each bullet under 18 words. No preamble.`;
    highlights = (await callBrain({
      maxTokens: 400,
      tier: 'pro',
      messages: [{ role: 'user', content: prompt }],
    })).trim();
  } catch {
    // Brain unreachable — stats-only digest is still fine.
  }

  const { data: saved, error } = await supabase
    .from('weekly_digests')
    .upsert({
      user_id: user.id,
      week_start: weekStart,
      units,
      commission,
      gross,
      contacts_added: contactsAdded,
      contacts_touched: contactsTouched,
      summary,
      highlights,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_start' })
    .select('*')
    .single();

  if (error) throw error;
  return saved as WeeklyDigest;
}

// Manual "Regen" — rebuilds the week the rep is currently reviewing.
export function generateReviewDigest(): Promise<WeeklyDigest | null> {
  return generateDigestForWeek(reviewWeekStart());
}

// Called on app open. Ensures the prior-week digest exists and is final:
//   • no digest for the review week yet           → generate it (Sunday's first look)
//   • week has ended but the saved copy predates   → regenerate once with final
//     the close (an in-progress Sunday snapshot)      numbers (the Monday auto-populate)
// Otherwise returns the saved digest untouched. Purely a review roll-up — no
// contact/deal/tier records are modified here.
export async function autoPopulateReviewDigest(): Promise<WeeklyDigest | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const weekStart = reviewWeekStart();
  const weekEndDate = new Date(weekStart + 'T00:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = ymd(weekEndDate);
  const todayYmd = ymd(new Date());
  const weekEnded = todayYmd >= weekEnd;

  const { data: existing } = await supabase
    .from('weekly_digests')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (!existing) {
    try { return await generateDigestForWeek(weekStart); }
    catch { return null; }
  }

  const generatedYmd = existing.generated_at ? ymd(new Date(existing.generated_at)) : '';
  if (weekEnded && generatedYmd < weekEnd) {
    try { return await generateDigestForWeek(weekStart); }
    catch { return existing as WeeklyDigest; }
  }

  return existing as WeeklyDigest;
}
