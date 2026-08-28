import { useCallback, useEffect, useState } from 'react';
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

export type UseUserDeals = {
  // null = still loading OR a first-load error (check `error` to tell them apart);
  // [] = loaded but genuinely empty.
  deals: V2DealRich[] | null;
  error: string | null;
  reload: () => void;
};

export function useUserDeals(refetchKey: number = 0): UseUserDeals {
  const [deals, setDeals] = useState<V2DealRich[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('deals')
      .select('id,title,stock,vehicle,amount,front_gross,back_gross,closed_at,deal_type,funding,split,split_with')
      .order('closed_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setError(error.message); return; } // keep prior data; surface the error
        setError(null);
        setDeals((data ?? []).map(rowToDeal));
      });
    return () => { cancelled = true; };
  }, [refetchKey, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { deals, error, reload };
}
