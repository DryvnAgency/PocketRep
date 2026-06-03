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

function isoMonday(d: Date): string {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return ymd(x);
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

export async function generateDigestForCurrentWeek(): Promise<WeeklyDigest | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date();
  const weekStart = isoMonday(today);
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
