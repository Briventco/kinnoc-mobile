import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';

import type { DiscoverFilter, DiscoverHome, DiscoverItem, Page } from '@/api/types';
import { nextCursor } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useDiscoverHome() {
  return useQuery({ queryKey: keys.discoverHome, queryFn: () => api.discover.home() });
}

export function useDiscoverList(filter: DiscoverFilter, query: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.discoverList(filter, query),
    queryFn: ({ pageParam }) => api.discover.list(filter, query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
  });
}

/** The item as a loaded list or the Discover home shows it, if any. */
export function cachedDiscoverItem(id: string): DiscoverItem | undefined {
  // The prefix also matches cached details, which are neither shape.
  for (const [, data] of queryClient.getQueriesData<DiscoverHome | InfiniteData<Page<DiscoverItem>> | DiscoverItem>({ queryKey: keys.discoverAll })) {
    if (!data || 'kind' in data) continue;
    const items = 'pages' in data ? data.pages.flatMap((p) => p.items) : [...data.thisWeek, ...data.closingSoon, ...data.upcomingEvents, ...data.resources];
    const found = items.find((i) => i.id === id);
    if (found) return found;
  }
  return undefined;
}

/** The full item. What the list already showed appears at once while the detail loads. */
export function useDiscoverItem(id: string) {
  return useQuery({
    queryKey: keys.discoverItem(id),
    queryFn: () => api.discover.get(id),
    placeholderData: () => cachedDiscoverItem(id),
  });
}
