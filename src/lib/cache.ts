import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import type { DiscoverHome, DiscoverItem, FeedItem, Page, Post, SavedItem } from '@/api/types';

import { keys, queryClient } from './query';

export const flatten = <T>(data: InfiniteData<Page<T>> | undefined): T[] => data?.pages.flatMap((p) => p.items) ?? [];

export const nextCursor = <T>(last: Page<T>) => last.nextCursor;

function mapPages<T>(data: InfiniteData<Page<T>> | undefined, fn: (item: T) => T): InfiniteData<Page<T>> | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map(fn) })) };
}

/** Applies a change to one post wherever it is cached: feeds, detail, profile lists, saved. */
export function updatePostEverywhere(postId: string, fn: (post: Post) => Post) {
  const apply = (item: FeedItem) => (item.kind === 'post' && item.id === postId ? fn(item) : item);
  queryClient.setQueriesData<InfiniteData<Page<FeedItem>>>({ queryKey: keys.feedAll }, (d) => mapPages(d, apply));
  queryClient.setQueriesData<InfiniteData<Page<Post>>>({ queryKey: ['profile'] }, (d) =>
    d && 'pages' in d ? mapPages(d, (p) => (p.id === postId ? fn(p) : p)) : d,
  );
  queryClient.setQueryData<Post>(keys.post(postId), (p) => (p ? fn(p) : p));
  queryClient.setQueryData<InfiniteData<Page<SavedItem>>>(keys.saved, (d) =>
    mapPages(d, (s) => (s.kind === 'post' && s.post.id === postId ? { ...s, post: fn(s.post) } : s)),
  );
}

/** Applies a change to one Discover item wherever it is cached. */
export function updateDiscoverEverywhere(itemId: string, fn: (item: DiscoverItem) => DiscoverItem) {
  const apply = <T extends DiscoverItem>(i: T): T => (i.id === itemId ? (fn(i) as T) : i);
  queryClient.setQueryData<DiscoverHome>(keys.discoverHome, (h) =>
    h
      ? {
          thisWeek: h.thisWeek.map(apply),
          closingSoon: h.closingSoon.map(apply),
          upcomingEvents: h.upcomingEvents.map(apply),
          resources: h.resources.map(apply),
        }
      : h,
  );
  queryClient.setQueriesData<InfiniteData<Page<DiscoverItem>>>({ queryKey: ['discover', 'list'] }, (d) => mapPages(d, apply));
  queryClient.setQueryData<DiscoverItem>(keys.discoverItem(itemId), (i) => (i ? fn(i) : i));
  queryClient.setQueryData<InfiniteData<Page<SavedItem>>>(keys.saved, (d) =>
    mapPages(d, (s) => (s.kind === 'discover' && s.item.id === itemId ? { ...s, item: fn(s.item) } : s)),
  );
}

/** Snapshot of queries to restore when an optimistic update fails. */
export function snapshot(queryKeys: QueryKey[]) {
  const saved = queryKeys.flatMap((k) => queryClient.getQueriesData({ queryKey: k }));
  return () => saved.forEach(([key, data]) => queryClient.setQueryData(key, data));
}
