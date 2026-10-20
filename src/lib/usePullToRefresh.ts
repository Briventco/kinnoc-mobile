import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that reflects only the user's pull, not background refetches
 * (which would otherwise show the spinner whenever a stale query refreshes on mount).
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  }, [refresh]);
  return { refreshing, onRefresh };
}
