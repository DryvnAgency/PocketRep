// Cross-deal book context for Rex. Builds the full-book payload that the
// brain sees on every voice query: tier buckets, stalled/dead segments,
// per-contact essentials. The payload is short enough to stay under the
// brain prompt budget — we slice each list at 30 contacts and trust Rex
// to ask for more via filter_contacts if needed.

import { supabase } from '@/lib/supabase';

export type BookContact = {
  id: string;
  name: string;
  heat_score: number;
  vehicle: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  last_contact_date: string | null;
  last_contact_summary: string | null;
  lease_end_date: string | null;
  current_mileage: number | null;
  preferred_language: 'en' | 'es';
  rep_decision: string | null;
  is_past_customer: boolean;
  do_not_contact: boolean;
  tags: string[];
  days_silent: number;
};

export type BookContext = {
  total: number;
  hot: BookContact[];
  warm: BookContact[];
  cold: BookContact[];
  dead: BookContact[];
  past_customers: BookContact[];
  stalled: BookContact[];
  by_make_count: Record<string, number>;
  by_model_count: Record<string, number>;
};

function daysSince(iso: string | null): number {
  if (!iso) return 999;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

function rowToBook(r: any): BookContact {
  return {
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    heat_score: Number(r.heat_score ?? 0),
    vehicle: r.vehicle,
    vehicle_make: r.vehicle_make,
    vehicle_model: r.vehicle_model,
    last_contact_date: r.last_contact_date,
    last_contact_summary: r.last_contact_summary,
    lease_end_date: r.lease_end_date,
    current_mileage: r.current_mileage,
    preferred_language: (r.preferred_language ?? 'en') as 'en' | 'es',
    rep_decision: r.rep_decision,
    is_past_customer: !!r.is_past_customer,
    do_not_contact: !!r.do_not_contact,
    tags: Array.isArray(r.tags) ? r.tags : [],
    days_silent: daysSince(r.last_contact_date),
  };
}

export async function loadBookContext(): Promise<BookContext> {
  const { data, error } = await supabase
    .from('contacts')
    .select(
      'id,first_name,last_name,heat_score,vehicle,vehicle_make,vehicle_model,last_contact_date,last_contact_summary,lease_end_date,current_mileage,preferred_language,rep_decision,is_past_customer,do_not_contact,tags'
    )
    .eq('is_deleted', false)
    .order('heat_score', { ascending: false })
    .limit(100);
  // NOTE: demo/tour contacts ARE included here on purpose — they must work fully
  // with Rex (blast/sequence/coach). The guarantee that a demo NEVER receives a
  // real carrier SMS lives at the single send chokepoint (lib/v2/smsLauncher.ts
  // launchSms): a demo contact is simulated there, never dialed out.

  if (error) {
    return {
      total: 0, hot: [], warm: [], cold: [], dead: [],
      past_customers: [], stalled: [], by_make_count: {}, by_model_count: {},
    };
  }

  const rows = (data ?? []).map(rowToBook);
  const hot: BookContact[] = [];
  const warm: BookContact[] = [];
  const cold: BookContact[] = [];
  const dead: BookContact[] = [];
  const pastCustomers: BookContact[] = [];
  const stalled: BookContact[] = [];
  const byMake: Record<string, number> = {};
  const byModel: Record<string, number> = {};

  for (const c of rows) {
    if (c.is_past_customer) pastCustomers.push(c);

    const isDead =
      c.heat_score < 20 || c.days_silent > 90 || c.rep_decision === 'kill' || c.rep_decision === 'dead';

    if (isDead) dead.push(c);
    else if (c.heat_score >= 80) hot.push(c);
    else if (c.heat_score >= 50) warm.push(c);
    else cold.push(c);

    if (!isDead && c.days_silent >= 14) stalled.push(c);

    if (c.vehicle_make) byMake[c.vehicle_make] = (byMake[c.vehicle_make] ?? 0) + 1;
    if (c.vehicle_model) byModel[c.vehicle_model] = (byModel[c.vehicle_model] ?? 0) + 1;
  }

  return {
    total: rows.length,
    hot: hot.sort((a, b) => b.heat_score - a.heat_score),
    warm: warm.sort((a, b) => b.heat_score - a.heat_score),
    cold: cold.sort((a, b) => b.heat_score - a.heat_score),
    dead,
    past_customers: pastCustomers,
    stalled: stalled.sort((a, b) => b.days_silent - a.days_silent),
    by_make_count: byMake,
    by_model_count: byModel,
  };
}

// Compact text representation for the brain prompt — short to keep tokens low.
export function bookContextForPrompt(ctx: BookContext): string {
  const fmt = (label: string, list: BookContact[], limit = 30): string => {
    if (list.length === 0) return `${label}: (none)`;
    const head = list.slice(0, limit).map(c => {
      const bits: string[] = [`${c.name}|${c.id}|heat ${c.heat_score}|${c.days_silent}d silent`];
      if (c.vehicle) bits.push(c.vehicle);
      if (c.lease_end_date) bits.push(`lease ${c.lease_end_date}`);
      if (c.current_mileage) bits.push(`${c.current_mileage} mi`);
      if (c.preferred_language === 'es') bits.push('es');
      if (c.last_contact_summary) bits.push(`note: ${c.last_contact_summary.slice(0, 60)}`);
      return `- ${bits.join(' · ')}`;
    }).join('\n');
    const tail = list.length > limit ? `\n  …+${list.length - limit} more (use filter_contacts)` : '';
    return `${label} (${list.length}):\n${head}${tail}`;
  };
  return [
    `BOOK STATE — ${ctx.total} total contacts`,
    fmt('HOT (>=80)', ctx.hot),
    fmt('WARM (50-79)', ctx.warm),
    fmt('COLD (20-49)', ctx.cold),
    fmt('DEAD (<20 or 90d silent)', ctx.dead, 15),
    fmt('PAST CUSTOMERS', ctx.past_customers, 15),
    fmt('STALLED (>=14d silent, not dead)', ctx.stalled, 20),
  ].join('\n\n');
}
