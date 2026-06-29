import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// One row of the rep's Rex action audit trail (public.rex_action_log).
export type RexActionLogRow = {
  id: string;
  action_type: string;
  action_payload: Record<string, unknown> | null;
  contact_ids: string[] | null;
  confirmed_at: string | null;
  executed_at: string | null;
  result: 'success' | 'cancelled' | 'partial' | 'failed' | null;
  created_at: string;
};

// Read-only view of the rep's own rex_action_log (RLS owner-scoped). Mirrors the
// useUserDeals/useContacts pattern: null = loading, [] = genuinely empty, and the
// error string is surfaced separately. Pass a changing refetchKey (or call reload)
// to refresh.
export function useRexActionLog(refetchKey = 0): {
  logs: RexActionLogRow[] | null;
  error: string | null;
  reload: () => void;
} {
  const [logs, setLogs] = useState<RexActionLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLogs(null);
    setError(null);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setLogs([]); return; }
      const { data, error: err } = await supabase
        .from('rex_action_log')
        .select('id,action_type,action_payload,contact_ids,confirmed_at,executed_at,result,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (err) { setError(err.message); return; }
      setLogs((data ?? []) as RexActionLogRow[]);
    })();
    return () => { cancelled = true; };
  }, [refetchKey, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  return { logs, error, reload };
}
