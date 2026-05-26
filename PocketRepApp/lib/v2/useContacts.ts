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
  budget: string | null;
  tradeIn: string | null;
  tags: string[];
  notes: string | null;
  nextStep: string | null;
  milestones: Array<{ kind: string; t: string; d: string }>;
};

export function tierFromScore(score: number): TierKey {
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  return 'watch';
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
    tier: tierFromScore(score),
    days: daysSince(r.last_contact_date),
    heatScore: score,
    planLabel: r.plan_label,
    phone: r.phone,
    budget: r.budget,
    tradeIn: r.trade_in,
    tags: Array.isArray(r.tags) ? r.tags : [],
    notes: r.notes,
    nextStep: r.next_step,
    milestones: Array.isArray(r.milestones) ? r.milestones : [],
  };
}

export function useContacts() {
  const [contacts, setContacts] = useState<V2Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select(
        'id,first_name,last_name,vehicle,trim,heat_score,last_contact_date,plan_label,phone,budget,trade_in,tags,notes,next_step,milestones'
      )
      .eq('is_deleted', false);

    if (error) {
      setError(error.message);
      setContacts([]);
      return;
    }

    const rows = (data ?? []).map(rowToContact);
    rows.sort((a, b) => b.heatScore - a.heatScore || a.days - b.days);
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
