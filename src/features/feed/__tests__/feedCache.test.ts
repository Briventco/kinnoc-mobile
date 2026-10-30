import type { InfiniteData } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { FeedItem, Page, Post } from '@/api/types';
import { flattenUnique, prependPost, removePostEverywhere } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';

import { toggleLike } from '../hooks';

jest.mock('@/services', () => ({
  api: { feed: { setLiked: jest.fn(), get: jest.fn() } },
  realtime: { live: false },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { feed: { setLiked: jest.Mock } } };

const post = (id: string, over: Partial<Post> = {}): Post => ({
  kind: 'post',
  id,
  author: { id: 'ada', username: 'ada', displayName: 'Ada', avatarUrl: null },
  community: null,
  text: id,
  media: [],
  link: null,
  createdAt: '2026-10-25T09:00:00.000Z',
  editedAt: null,
  likeCount: 5,
  commentCount: 0,
  likedByMe: false,
  savedByMe: false,
  topReply: null,
  isMine: false,
  ...over,
});

type Feed = InfiniteData<Page<FeedItem>, string | null>;
const feed = (...pages: Post[][]): Feed => ({ pages: pages.map((items, i) => ({ items, nextCursor: i < pages.length - 1 ? `c${i}` : null })), pageParams: pages.map((_, i) => (i ? `c${i - 1}` : null)) });
const ids = (key: readonly unknown[]) => flattenUnique(queryClient.getQueryData<Feed>(key), (i) => i.id).map((i) => i.id);

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});

describe('feed cache', () => {
  it('shows a post once even if two pages contain it', () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a'), post('b')], [post('b'), post('c')]));
    expect(ids(keys.feed('for-you'))).toEqual(['a', 'b', 'c']);
  });

  it('puts a new post at the top of a loaded feed only once', () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a')]));
    prependPost(keys.feed('for-you'), post('new'));
    prependPost(keys.feed('for-you'), post('new'));
    expect(ids(keys.feed('for-you'))).toEqual(['new', 'a']);
    // A feed that was never loaded stays unloaded; it fetches the post itself.
    prependPost(keys.feed('communities'), post('new'));
    expect(queryClient.getQueryData(keys.feed('communities'))).toBeUndefined();
  });

  it('removes a deleted post from every feed and its detail', () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a'), post('b')]));
    queryClient.setQueryData(keys.communityPosts('c1'), feed([post('b')]));
    queryClient.setQueryData(keys.post('b'), post('b'));
    removePostEverywhere('b');
    expect(ids(keys.feed('for-you'))).toEqual(['a']);
    expect(ids(keys.communityPosts('c1'))).toEqual([]);
    expect(queryClient.getQueryData(keys.post('b'))).toBeUndefined();
  });
});

describe('toggleLike', () => {
  it('updates the post everywhere, then keeps the server’s count', async () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a')]));
    queryClient.setQueryData(keys.communityPosts('c1'), feed([post('a')]));
    api.feed.setLiked.mockResolvedValue({ likedByMe: true, likeCount: 9 });
    await toggleLike(post('a'));
    for (const key of [keys.feed('for-you'), keys.communityPosts('c1')]) {
      expect(queryClient.getQueryData<Feed>(key)!.pages[0].items[0]).toMatchObject({ likedByMe: true, likeCount: 9 });
    }
  });

  it('rolls back when the server refuses', async () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a')]));
    api.feed.setLiked.mockRejectedValue(new ApiError('forbidden', 'x', 403, {}, 'MEMBERSHIP_REQUIRED'));
    await expect(toggleLike(post('a'))).rejects.toMatchObject({ serverCode: 'MEMBERSHIP_REQUIRED' });
    expect(queryClient.getQueryData<Feed>(keys.feed('for-you'))!.pages[0].items[0]).toMatchObject({ likedByMe: false, likeCount: 5 });
  });

  it('removes a post that was deleted meanwhile', async () => {
    queryClient.setQueryData(keys.feed('for-you'), feed([post('a'), post('b')]));
    api.feed.setLiked.mockRejectedValue(new ApiError('not_found', 'x', 404, {}, 'POST_NOT_FOUND'));
    await expect(toggleLike(post('a'))).rejects.toBeTruthy();
    expect(ids(keys.feed('for-you'))).toEqual(['b']);
  });
});
