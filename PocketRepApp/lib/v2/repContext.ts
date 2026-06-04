// Shared "rep context" serializer for Rex. The Coach chat (and, later, Hey Rex
// voice) feed this into the prompt so Rex grounds answers in the rep's real
// book — referencing leads by name instead of giving generic advice.

import { supabase } from '@/lib/supabase';
import type { V2Contact } from './useContacts';
import type { PayPlan } from './payPlan';

export type MtdSummary = { units: number; commission: number };

// Month-to-date deals for the signed-in rep. RLS scopes rows to the user;
// split deals count as half a unit (mirrors MetricsTab). Best-effort — returns
// zeros on any error so the coach prompt still builds.
export async function loadMtdSummary(): Promise<MtdSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await supabase
    .from('deals')
    .select('amount,split,closed_at')
    .gte('closed_at', monthStart);
  if (error || !data) return { units: 0, commission: 0 };
  return {
    units: data.reduce((s, d: any) => s + (d.split ? 0.5 : 1), 0),
    commission: data.reduce((s, d: any) => s + Number(d.amount ?? 0), 0),
  };
}

// Cross-contact activity feed for recall questions ("who did I talk to
// yesterday / this week"). Pulls the rep's logged interactions (call/text/email/
// note) with the contact name + timestamp, newest first. Best-effort: returns ''
// on any error so the coach prompt still builds.
export async function loadRecentActivity(days = 30, limit = 40): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '';
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select('type,notes,interaction_date,contacts!inner(first_name,last_name)')
      .eq('user_id', user.id)
      .gte('interaction_date', since)
      .order('interaction_date', { ascending: false })
      .limit(limit);
    if (error || !data) return '';
    return (data as any[])
      .map((r) => {
        const name = `${r.contacts?.first_name ?? ''} ${r.contacts?.last_name ?? ''}`.trim() || 'a contact';
        const d = new Date(r.interaction_date);
        const when = Number.isNaN(d.getTime())
          ? ''
          : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const note = r.notes ? ` — ${String(r.notes).slice(0, 80)}` : '';
        return `- ${when} · ${r.type} · ${name}${note}`;
      })
      .join('\n');
  } catch {
    return '';
  }
}

// Builds a compact context block: heat mix, MTD, pay plan, top active leads, and
// overdue follow-ups. Kept short so it fits comfortably in the prompt.
export function serializeRepContext(input: {
  contacts: V2Contact[];
  payPlan: PayPlan | null;
  mtd: MtdSummary | null;
}): string {
  const { contacts, payPlan, mtd } = input;
  const active = contacts.filter((c) => !c.doNotContact && !c.isPastCustomer);

  const tierCount = (t: string) => active.filter((c) => c.tier === t).length;
  const heat = `${tierCount('hot')} hot · ${tierCount('warm')} warm · ${tierCount('cold')} cold (${active.length} active)`;

  // Top leads by heat, then by staleness — capped to keep the prompt small.
  const byHeat = [...active].sort((a, b) => b.heatScore - a.heatScore || b.days - a.days);
  const topLeads =
    byHeat
      .slice(0, 12)
      .map(
        (c) =>
          `- ${c.name}${c.vehicle ? ` — ${c.vehicle}` : ''} · ${c.tier} · ${c.days}d since contact${c.nextStep ? ` · next: ${c.nextStep}` : ''}`,
      )
      .join('\n') || '(no active leads)';

  // Hot/warm leads going cold (>= 3 days since contact), most stale first.
  const overdue =
    active
      .filter((c) => (c.tier === 'hot' || c.tier === 'warm') && c.days >= 3)
      .sort((a, b) => b.days - a.days)
      .slice(0, 8)
      .map((c) => `- ${c.name} (${c.tier}, ${c.days}d)`)
      .join('\n') || '(none overdue)';

  const mtdLine = mtd
    ? `${mtd.units} unit${mtd.units === 1 ? '' : 's'}, $${Math.round(mtd.commission).toLocaleString()} commission`
    : '(unavailable)';

  const payLine = payPlan
    ? `front ${payPlan.frontPct}% / back ${payPlan.backPct}%, $${payPlan.flatMini} mini, $${payPlan.baseSalary} base; volume: ${payPlan.unitBonuses.map((t) => `${t.units}u→$${t.bonus}`).join(', ')}`
    : '(not set)';

  return `The rep's current book — use these REAL leads by name; never invent customers:
Heat: ${heat}
Month-to-date: ${mtdLine}
Pay plan: ${payLine}

Top active leads:
${topLeads}

Overdue follow-ups (going cold):
${overdue}`;
}
