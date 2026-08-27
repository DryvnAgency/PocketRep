// Pull-to-refresh + periodic polling hook for the Owner Control Center.
// Polls every 5 minutes while the tab is visible; pauses when hidden.

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 min

/**
 * Returns { refreshing, onRefresh, lastRefresh }.
 * Call `onRefresh()` for pull-to-refresh; the hook auto-polls on interval.
 */
export function useAdminRefresh(fetcher: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetcher();
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [fetcher]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      fetcher().then(() => setLastRefresh(new Date())).catch(() => {});
    }, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetcher]);

  return { refreshing, onRefresh, lastRefresh };
}
