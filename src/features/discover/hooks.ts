import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { DiscoverFilter } from '@/api/types';
import { nextCursor } from '@/lib/cache';
import { keys } from '@/lib/query';
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

export function useDiscoverItem(id: string) {
  return useQuery({ queryKey: keys.discoverItem(id), queryFn: () => api.discover.get(id) });
}
