import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import type { CreatePostInput, FeedScope, Post } from '@/api/types';
import { nextCursor, snapshot, updatePostEverywhere } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery({
    queryKey: keys.feed(scope),
    queryFn: ({ pageParam }) => api.feed.list(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
  });
}

export function usePost(postId: string) {
  return useQuery({ queryKey: keys.post(postId), queryFn: () => api.feed.get(postId) });
}

export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: keys.comments(postId),
    queryFn: ({ pageParam }) => api.feed.comments(postId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
  });
}

/** Optimistic like; the server's count wins when it answers. */
export function useToggleLike() {
  return useMutation({
    mutationFn: ({ post, liked }: { post: Post; liked: boolean }) => api.feed.setLiked(post.id, liked),
    onMutate: async ({ post, liked }) => {
      await queryClient.cancelQueries({ queryKey: keys.feedAll });
      const restore = snapshot([keys.feedAll, keys.post(post.id), ['profile'], keys.saved]);
      updatePostEverywhere(post.id, (p) => ({
        ...p,
        likedByMe: liked,
        likeCount: Math.max(0, p.likeCount + (liked === p.likedByMe ? 0 : liked ? 1 : -1)),
      }));
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSuccess: ({ likeCount }, { post }) => updatePostEverywhere(post.id, (p) => ({ ...p, likeCount })),
  });
}

export function useCreatePost() {
  return useMutation({
    mutationFn: (input: CreatePostInput) => api.feed.create(input),
    onSuccess: (post) => {
      void queryClient.invalidateQueries({ queryKey: keys.feedAll });
      void queryClient.invalidateQueries({ queryKey: keys.userPosts(post.author.id) });
    },
  });
}

export function useDeletePost() {
  return useMutation({
    mutationFn: (post: Post) => api.feed.remove(post.id),
    onSuccess: (_r, post) => {
      queryClient.removeQueries({ queryKey: keys.post(post.id) });
      void queryClient.invalidateQueries({ queryKey: keys.feedAll });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: keys.saved });
    },
  });
}

export function useAddComment(postId: string) {
  return useMutation({
    mutationFn: (text: string) => api.feed.comment(postId, text),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.comments(postId) });
      updatePostEverywhere(postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
    },
  });
}
