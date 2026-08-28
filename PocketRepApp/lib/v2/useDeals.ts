import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type V2Deal = {
  id: string;
  stock: string | null;
  vehicle: string | null;
  amount: number;
  frontGross: number | null;
  backGross: number | null;
  closedAt: string | null;
  dealType: 'NEW' | 'CPO' | 'USED' | null;
  funding: 'finance' | 'lease' | 'cash' | null;
  split: boolean;
  splitWith: string | null;
};

export function useDeals(contactId: string | null, refetchKey: number = 0) {
  const [deals, setDeals] = useState<V2Deal[]>([]);
  // Previously a load failure just returned early, leaving deals at [] —
  // indistinguishable from "this contact genuinely has zero deals." Surface
  // the failure so the UI can tell the two apart.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setDeals([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    supabase
      .from('deals')
      .select('id,stock,vehicle,amount,front_gross,back_gross,closed_at,deal_type,funding,split,split_with')
      .eq('contact_id', contactId)
      .order('closed_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        if (loadError) {
          setError(loadError.message);
          return;
        }
        setDeals((data ?? []).map((r: any) => ({
          id: r.id,
          stock: r.stock,
          vehicle: r.vehicle,
          amount: Number(r.amount ?? 0),
          frontGross: r.front_gross == null ? null : Number(r.front_gross),
          backGross: r.back_gross == null ? null : Number(r.back_gross),
          closedAt: r.closed_at,
          dealType: r.deal_type,
          funding: r.funding,
          split: !!r.split,
          splitWith: r.split_with,
        })));
      });
    return () => { cancelled = true; };
  }, [contactId, refetchKey]);

  return { deals, error };
}
