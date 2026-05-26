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

export function useDeals(contactId: string | null) {
  const [deals, setDeals] = useState<V2Deal[]>([]);

  useEffect(() => {
    if (!contactId) {
      setDeals([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('deals')
      .select('id,stock,vehicle,amount,front_gross,back_gross,closed_at,deal_type,funding,split,split_with')
      .eq('contact_id', contactId)
      .order('closed_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
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
  }, [contactId]);

  return deals;
}
