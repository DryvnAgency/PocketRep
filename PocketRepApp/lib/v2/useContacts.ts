import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TierKey } from '@/components/v2/tokens';

export type V2Contact = {
  id: string;
  name: string;
  vehicle: string | null;
  trim: string | null;
  tier: TierKey;
  days: number;
  heatScore: number;
  planLabel: string | null;
  phone: string | null;
  email: string | null;
  budget: string | null;
  tradeIn: string | null;
  tags: string[];
  notes: string | null;
  nextStep: string | null;
  birthday: string | null;
  milestones: Array<{ kind: string; t: string; d: string }>;

  // Rex intelligence fields (PR #36+)
  preferredLanguage: 'en' | 'es';
  repDecision: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  leaseEndDate: string | null;
  currentMileage: number | null;
  isPastCustomer: boolean;
  doNotContact: boolean;
  photoUrl: string | null;
};

export function tierFromScore(score: number): TierKey {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

function daysSince(date: string | null): number {
  if (!date) return 0;
  const d = new Date(date + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - d) / 86_400_000));
}

function rowToContact(r: any): V2Contact {
  const score = Number(r.heat_score ?? 0);
  return {
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' '),
    vehicle: r.vehicle,
    trim: r.trim,
    tier: (r.tier_override as TierKey | null) ?? tierFromScore(score),
    days: daysSince(r.last_contact_date),
    heatScore: score,
    planLabel: r.plan_label,
    phone: r.phone,
    email: r.email ?? null,
    budget: r.budget,
    tradeIn: r.trade_in,
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes,
    nextStep: r.next_step,
    birthday: r.birthday ?? null,
    milestones: Array.isArray(r.milestones) ? r.milestones : [],
    preferredLanguage: (r.preferred_language ?? 'en') as 'en' | 'es',
    repDecision: r.rep_decision ?? null,
    vehicleMake: r.vehicle_make ?? null,
    vehicleModel: r.vehicle_model ?? null,
    vehicleYear: r.vehicle_year ?? null,
    leaseEndDate: r.lease_end_date ?? null,
    currentMileage: r.current_mileage ?? null,
    isPastCustomer: !!r.is_past_customer,
    doNotContact: !!r.do_not_contact,
    photoUrl: r.photo_url ?? null,
  };
}

export function useContacts() {
  const [contacts, setContacts] = useState<V2Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select(
        'id,first_name,last_name,vehicle,trim,heat_score,last_contact_date,plan_label,phone,email,budget,trade_in,tags,notes,next_step,birthday,milestones,preferred_language,rep_decision,vehicle_make,vehicle_model,vehicle_year,lease_end_date,current_mileage,is_past_customer,do_not_contact,photo_url,tier_override'
      )
      .eq('is_deleted', false);

    if (error) {
      setError(error.message);
      setContacts([]);
      return;
    }

    const rows = (data ?? []).map(rowToContact);
    // Group by tier (override-aware) first, then by heat, so a manually-set
    // tier sorts with its band rather than by its raw heat score.
    const rank: Record<TierKey, number> = { hot: 3, warm: 2, cold: 1 };
    rows.sort((a, b) => rank[b.tier] - rank[a.tier] || b.heatScore - a.heatScore || a.days - b.days);
    setContacts(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const patchLocal = useCallback((id: string, patch: Partial<V2Contact>) => {
    setContacts(prev =>
      prev ? prev.map(c => (c.id === id ? { ...c, ...patch } : c)) : prev
    );
  }, []);

  return { contacts, error, reload: load, patchLocal };
}
