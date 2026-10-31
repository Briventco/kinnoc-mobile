import { InfiniteQueryObserver, type InfiniteData } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { FeedItem, Page } from '@/api/types';
import { nextCursor } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';

import { refreshFeed, refreshFirstPage } from '../refresh';

jest.mock('@/services', () => ({ api: { feed: { list: jest.fn() } } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { feed: { list: jest.Mock } } };

type Feed = InfiniteData<Page<FeedItem>, string | null>;
const post = (id: string) => ({ kind: 'post', id }) as FeedItem;
const page = (ids: string[], next: string | null): Page<FeedItem> => ({ items: ids.map(post), nextCursor: next });
const ids = () => queryClient.getQueryData<Feed>(keys.feed('for-you'))?.pages.flatMap((p) => p.items.map((i) => i.id));

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});
afterEach(() => queryClient.clear());

describe('refreshFirstPage', () => {
  it('replaces every loaded page with the latest first page, so paging restarts from it', async () => {
    queryClient.setQueryData<Feed>(keys.feed('for-you'), { pages: [page(['b', 'c'], 'c1'), page(['d', 'e'], 'c2')], pageParams: [null, 'c1'] });
    api.feed.list.mockResolvedValue(page(['a', 'b'], 'fresh'));
    await refreshFeed('for-you');
    expect(api.feed.list).toHaveBeenCalledWith('for-you', null);
    expect(queryClient.getQueryData<Feed>(keys.feed('for-you'))).toEqual({ pages: [page(['a', 'b'], 'fresh')], pageParams: [null] });
  });

  it('keeps the posts already shown when the API is down', async () => {
    queryClient.setQueryData<Feed>(keys.feed('for-you'), { pages: [page(['b', 'c'], 'c1')], pageParams: [null] });
    api.feed.list.mockRejectedValue(new ApiError('network', 'Offline'));
    await expect(refreshFeed('for-you')).rejects.toMatchObject({ code: 'network' });
    expect(ids()).toEqual(['b', 'c']);
  });

  it('runs one refresh per feed at a time; a second pull or tap does nothing', async () => {
    let answer!: (p: Page<FeedItem>) => void;
    api.feed.list.mockReturnValue(new Promise<Page<FeedItem>>((resolve) => (answer = resolve)));
    const first = refreshFeed('for-you');
    await expect(refreshFeed('for-you')).resolves.toBe(false);
    answer(page(['a'], null));
    await expect(first).resolves.toBe(true);
    expect(api.feed.list).toHaveBeenCalledTimes(1);
    // Once finished, the next refresh runs again.
    api.feed.list.mockResolvedValue(page(['a'], null));
    await expect(refreshFeed('for-you')).resolves.toBe(true);
  });

  it('cancels a "load more" in flight, so it cannot add old posts to the new list', async () => {
    const key = keys.feed('for-you');
    const load = jest.fn(async (cursor: string | null) => (cursor ? new Promise<Page<FeedItem>>(() => {}) : page(['new'], 'n1')));
    queryClient.setQueryData<Feed>(key, { pages: [page(['old'], 'c1')], pageParams: [null] });
    const observer = new InfiniteQueryObserver(queryClient, {
      queryKey: key,
      queryFn: ({ pageParam }) => load(pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: nextCursor,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    void observer.fetchNextPage();
    await refreshFirstPage(key, load);
    expect(ids()).toEqual(['new']);
    expect(queryClient.getQueryState(key)?.fetchStatus).toBe('idle');
    unsubscribe();
  });

  describe('when an automatic refetch overlaps', () => {
    const key = keys.feed('for-you');
    const observe = (queryFn: () => Promise<Page<FeedItem>>) =>
      new InfiniteQueryObserver(queryClient, { queryKey: key, queryFn, initialPageParam: null as string | null, getNextPageParam: nextCursor, staleTime: 0 });

    it('an older automatic refetch still running cannot overwrite the fresh page', async () => {
      queryClient.setQueryData<Feed>(key, { pages: [page(['old'], null)], pageParams: [null] });
      let finishAutomatic!: (p: Page<FeedItem>) => void;
      const observer = observe(() => new Promise<Page<FeedItem>>((resolve) => (finishAutomatic = resolve)));
      const unsubscribe = observer.subscribe(() => {});
      let finishManual!: (p: Page<FeedItem>) => void;
      const refresh = refreshFirstPage(key, () => new Promise<Page<FeedItem>>((resolve) => (finishManual = resolve)));
      // The automatic refetch (on returning to the app) starts after the manual one…
      await new Promise((r) => setTimeout(r, 0));
      void observer.refetch();
      // …the manual result arrives, then the automatic one, with older data.
      finishManual(page(['fresh'], null));
      await expect(refresh).resolves.toBe(true);
      finishAutomatic(page(['stale'], null));
      await new Promise((r) => setTimeout(r, 0));
      expect(ids()).toEqual(['fresh']);
      unsubscribe();
    });

    it('a newer automatic result that already arrived is kept, not overwritten', async () => {
      queryClient.setQueryData<Feed>(key, { pages: [page(['old'], null)], pageParams: [null] });
      const observer = observe(async () => page(['automatic'], null));
      const unsubscribe = observer.subscribe(() => {});
      let finishManual!: (p: Page<FeedItem>) => void;
      const refresh = refreshFirstPage(key, () => new Promise<Page<FeedItem>>((resolve) => (finishManual = resolve)));
      await new Promise((r) => setTimeout(r, 0));
      await observer.refetch();
      expect(ids()).toEqual(['automatic']);
      finishManual(page(['manual, sent earlier'], null));
      await expect(refresh).resolves.toBe(false);
      expect(ids()).toEqual(['automatic']);
      unsubscribe();
    });

    it('a like during the refresh does not stop the fresh page from landing', async () => {
      queryClient.setQueryData<Feed>(key, { pages: [page(['old'], null)], pageParams: [null] });
      let finishManual!: (p: Page<FeedItem>) => void;
      const refresh = refreshFirstPage(key, () => new Promise<Page<FeedItem>>((resolve) => (finishManual = resolve)));
      await new Promise((r) => setTimeout(r, 0));
      queryClient.setQueryData<Feed>(key, (d) => d && { ...d }); // a local edit, like toggleLike's
      finishManual(page(['fresh'], null));
      await expect(refresh).resolves.toBe(true);
      expect(ids()).toEqual(['fresh']);
    });
  });
});
