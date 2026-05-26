import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { V2Deal } from './useDeals';

export type V2DealRich = V2Deal & {
  name: string;
  month: number;
  year: number;
};

function rowToDeal(r: any): V2DealRich {
  const dt = r.closed_at ? new Date(r.closed_at + 'T12:00:00') : new Date();
  return {
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
    name: r.title ?? '—',
    month: dt.getMonth(),
    year: dt.getFullYear(),
  };
}

export function useUserDeals(refetchKey: number = 0): V2DealRich[] | null {
  const [deals, setDeals] = useState<V2DealRich[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('deals')
      .select('id,title,stock,vehicle,amount,front_gross,back_gross,closed_at,deal_type,funding,split,split_with')
      .order('closed_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setDeals((data ?? []).map(rowToDeal));
      });
    return () => { cancelled = true; };
  }, [refetchKey]);

  return deals;
}
