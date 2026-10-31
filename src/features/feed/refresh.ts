import { hashKey, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import type { FeedScope, Page } from '@/api/types';
import { keys, queryClient } from '@/lib/query';
import { refreshRelativeTimestamps } from '@/lib/useRelativeTime';
import { api } from '@/services';

/**
 * Replaces a paged list with a freshly fetched first page. Unlike a refetch, which reloads every
 * page already loaded with cursors from before, this starts over: paging continues from the new
 * first page, so nothing is skipped or shown twice. If the fetch fails, the list is unchanged.
 *
 * Other fetches of the same list (a "load more", or an automatic refetch on returning to the app)
 * must not undo it with older data:
 * - anything in flight is cancelled before the fetch, and again just before the write, so a fetch
 *   that started earlier cannot land on top of the fresh page;
 * - if another fetch of the list finished while this one ran, its result is at least as new, and
 *   it is kept rather than overwritten. Local edits (a like, say) do not count.
 * Resolves true when the fresh page was written.
 */
export async function refreshFirstPage<T>(queryKey: QueryKey, load: (cursor: string | null) => Promise<Page<T>>): Promise<boolean> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  const hash = hashKey(queryKey);
  let newerArrived = false;
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.query.queryHash === hash && event.action.type === 'success' && !event.action.manual) newerArrived = true;
  });
  try {
    const first = await load(null);
    await queryClient.cancelQueries({ queryKey, exact: true });
    if (newerArrived) return false;
    queryClient.setQueryData<InfiniteData<Page<T>, string | null>>(queryKey, { pages: [first], pageParams: [null] });
    return true;
  } finally {
    unsubscribe();
  }
}

/* One refresh per feed at a time, shared by the pull gesture and the refresh button. */
const running = new Set<FeedScope>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Fetches the latest posts for a feed. Resolves false if a refresh of that feed was already
 * running (so a second pull or tap does nothing); rejects if the fetch failed, with the posts
 * already shown kept.
 */
export async function refreshFeed(scope: FeedScope): Promise<boolean> {
  if (running.has(scope)) return false;
  running.add(scope);
  notify();
  try {
    await refreshFirstPage(keys.feed(scope), (cursor) => api.feed.list(scope, cursor));
    refreshRelativeTimestamps();
    return true;
  } finally {
    running.delete(scope);
    notify();
  }
}

/** Whether a refresh of this feed is running, for its spinner and to disable its button. */
export function useFeedRefreshing(scope: FeedScope) {
  return useSyncExternalStore(subscribe, () => running.has(scope));
}
