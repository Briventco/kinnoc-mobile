import { type InfiniteData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError, isApiError } from '@/api/errors';
import type { Comment, CommentInput, FeedScope, Page, Post, PostUpdate, Profile } from '@/api/types';
import { nextCursor, prependPost, removePostEverywhere, updatePostEverywhere } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

import { createPostPublisher, type PostDraft } from './drafts';
import { createLikeSync } from './likes';

type CommentPages = InfiniteData<Page<Comment>, string | null>;

/** Refusals that retrying cannot change: a hidden or deleted post, a members-only community. */
const final = (count: number, error: unknown) =>
  !(error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden' || error.code === 'unsupported')) && count < 2;

/** The post is gone (deleted, or no longer visible to the viewer). */
export const postGone = (error: unknown) => isApiError(error, 'POST_NOT_FOUND');

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery({
    queryKey: keys.feed(scope),
    queryFn: ({ pageParam }) => api.feed.list(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    retry: final,
  });
}

/** One community's posts, newest first. Members-only communities refuse others with `MEMBERSHIP_REQUIRED`. */
export function useCommunityPosts(communityId: string) {
  return useInfiniteQuery({
    queryKey: keys.communityPosts(communityId),
    queryFn: ({ pageParam }) => api.feed.community(communityId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    retry: final,
  });
}

export function usePost(postId: string) {
  return useQuery({ queryKey: keys.post(postId), queryFn: () => api.feed.get(postId), retry: final });
}

/** Re-reads a post for its exact like and comment counts after a change, or drops it if it is gone. */
async function refreshPost(postId: string) {
  try {
    const fresh = await api.feed.get(postId);
    updatePostEverywhere(postId, () => fresh);
  } catch (error) {
    if (postGone(error)) removePostEverywhere(postId);
  }
}

/* ---------- Likes ---------- */

const likes = createLikeSync({
  send: (postId, liked) => api.feed.setLiked(postId, liked),
  apply: (postId, { liked, likeCount }) => updatePostEverywhere(postId, (p) => ({ ...p, likedByMe: liked, likeCount })),
});

/**
 * Likes and unlikes at once on screen; rapid taps settle on the last one (see `createLikeSync`).
 * Rejects when the server refused, after the post has returned to the server's state; a post
 * that has gone is removed from the lists.
 */
export function toggleLike(post: Post): Promise<void> {
  return likes(post.id, { liked: post.likedByMe, likeCount: post.likeCount }, !post.likedByMe).catch((error: unknown) => {
    if (postGone(error)) removePostEverywhere(post.id);
    throw error;
  });
}

/* ---------- Posts ---------- */

/**
 * Publishes the composer's draft (see `createPostPublisher`). Keep one per composer: it remembers
 * the draft's uploads and idempotency key across retries.
 */
export function useCreatePost() {
  const [publish] = useState(() => createPostPublisher(api));
  return useMutation({
    mutationFn: (draft: PostDraft) => publish(draft),
    onSuccess: (post) => {
      if (post.community) {
        prependPost(keys.feed('communities'), post);
        prependPost(keys.communityPosts(post.community.id), post);
      } else {
        prependPost(keys.feed('for-you'), post);
      }
      // The Posts tab of the viewer's own profile.
      const me = queryClient.getQueryData<Profile>(keys.me);
      if (me) prependPost(keys.userPosts(me.id), post);
    },
  });
}

export function useUpdatePost(postId: string) {
  return useMutation({
    mutationFn: (changes: PostUpdate) => api.feed.update(postId, changes),
    onSuccess: (post) => updatePostEverywhere(postId, () => post),
  });
}

export function useDeletePost() {
  return useMutation({
    mutationFn: async (post: Post) => {
      try {
        await api.feed.remove(post.id);
      } catch (error) {
        // Already deleted: the outcome the user asked for.
        if (!postGone(error)) throw error;
      }
    },
    onSuccess: (_r, post) => removePostEverywhere(post.id),
  });
}

/* ---------- Comments ---------- */

/** Top-level comments, oldest first. */
export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: keys.comments(postId),
    queryFn: ({ pageParam }) => api.feed.comments(postId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    retry: final,
  });
}

/** Replies to one top-level comment, oldest first; loaded when the thread is opened. */
export function useReplies(postId: string, commentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.replies(postId, commentId),
    queryFn: ({ pageParam }) => api.feed.replies(postId, commentId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
    retry: final,
  });
}

const mapComments = (data: CommentPages | undefined, fn: (c: Comment) => Comment | null): CommentPages | undefined =>
  data && {
    ...data,
    pages: data.pages.map((p) => ({ ...p, items: p.items.flatMap((c) => fn(c) ?? []) })),
  };

/** Applies a change to a comment or reply wherever it is cached for this post. */
function patchComment(postId: string, commentId: string, fn: (c: Comment) => Comment | null) {
  // keys.comments is also the prefix of every reply list of the post.
  queryClient.setQueriesData<CommentPages>({ queryKey: keys.comments(postId) }, (d) => mapComments(d, (c) => (c.id === commentId ? fn(c) : c)));
}

/** Adds a new comment to the end of a list, when the list is fully loaded; otherwise reloads it. */
function appendComment(queryKey: readonly unknown[], comment: Comment) {
  const data = queryClient.getQueryData<CommentPages>(queryKey);
  const last = data?.pages.at(-1);
  if (!data || !last || last.nextCursor) {
    void queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }
  if (data.pages.some((p) => p.items.some((c) => c.id === comment.id))) return;
  queryClient.setQueryData<CommentPages>(queryKey, {
    ...data,
    pages: [...data.pages.slice(0, -1), { ...last, items: [...last.items, comment] }],
  });
}

/** Comments and replies. Retrying with the same `clientId` returns the original. */
export function useAddComment(postId: string) {
  return useMutation({
    mutationFn: (input: CommentInput) => api.feed.comment(postId, input),
    onSuccess: (comment) => {
      if (comment.parentId) {
        appendComment(keys.replies(postId, comment.parentId), comment);
        patchComment(postId, comment.parentId, (c) => ({ ...c, replyCount: c.replyCount + 1 }));
      } else {
        appendComment(keys.comments(postId), comment);
      }
      updatePostEverywhere(postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      void refreshPost(postId);
    },
    onError: (error) => {
      if (postGone(error)) removePostEverywhere(postId);
    },
  });
}

export function useEditComment(postId: string) {
  return useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) => api.feed.editComment(postId, commentId, text),
    onSuccess: (comment) => patchComment(postId, comment.id, () => comment),
  });
}

/**
 * The author, the post's author, or the community's owners and moderators. A top-level comment
 * with replies stays as a "deleted" placeholder, as the API lists it.
 */
export function useDeleteComment(postId: string) {
  return useMutation({
    mutationFn: async (comment: Comment) => {
      try {
        await api.feed.removeComment(postId, comment.id);
      } catch (error) {
        if (!isApiError(error, 'COMMENT_NOT_FOUND')) throw error;
      }
    },
    onSuccess: (_r, comment) => {
      const now = new Date().toISOString();
      patchComment(postId, comment.id, (c) => (!c.parentId && c.replyCount > 0 ? { ...c, text: '', author: null, deletedAt: now } : null));
      if (comment.parentId) patchComment(postId, comment.parentId, (c) => ({ ...c, replyCount: Math.max(0, c.replyCount - 1) }));
      void refreshPost(postId);
    },
  });
}
