import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import type { DiscoverHome, DiscoverItem, FeedItem, Page, Post, SavedItem } from '@/api/types';

import { keys, queryClient } from './query';

export const flatten = <T>(data: InfiniteData<Page<T>> | undefined): T[] => data?.pages.flatMap((p) => p.items) ?? [];

/**
 * Like `flatten`, keeping the first copy of any item that appears twice (for example a post
 * prepended after it was created and then returned again by a refresh).
 */
export function flattenUnique<T>(data: InfiniteData<Page<T>> | undefined, key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return flatten(data).filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

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

/** Drops a deleted (or no longer visible) post from every cached list and its detail. */
export function removePostEverywhere(postId: string) {
  const keep = (item: FeedItem) => !(item.kind === 'post' && item.id === postId);
  const filterPages = <T>(data: InfiniteData<Page<T>> | undefined, fn: (item: T) => boolean) =>
    data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter(fn) })) } : data;
  queryClient.setQueriesData<InfiniteData<Page<FeedItem>>>({ queryKey: keys.feedAll }, (d) => filterPages(d, keep));
  queryClient.setQueriesData<InfiniteData<Page<Post>>>({ queryKey: ['profile'] }, (d) =>
    d && 'pages' in d ? filterPages(d, (p) => p.id !== postId) : d,
  );
  queryClient.setQueryData<InfiniteData<Page<SavedItem>>>(keys.saved, (d) => filterPages(d, (s) => !(s.kind === 'post' && s.post.id === postId)));
  queryClient.removeQueries({ queryKey: keys.post(postId) });
}

/** Puts a new post at the top of a cached list (a feed or a community's posts), if that list is loaded. */
export function prependPost(queryKey: QueryKey, post: Post) {
  queryClient.setQueryData<InfiniteData<Page<FeedItem>>>(queryKey, (d) => {
    if (!d?.pages.length) return d;
    const [first, ...rest] = d.pages;
    const items = [post, ...first.items.filter((i) => !(i.kind === 'post' && i.id === post.id))];
    return { ...d, pages: [{ ...first, items }, ...rest] };
  });
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
