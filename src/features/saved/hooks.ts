import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { describeError } from '@/api/errors';
import type { DiscoverItem, Post } from '@/api/types';
import { useToast } from '@/components/Toast';
import { nextCursor, snapshot, updateDiscoverEverywhere, updatePostEverywhere } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useSaved() {
  return useInfiniteQuery({
    queryKey: keys.saved,
    queryFn: ({ pageParam }) => api.saved.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled: api.capabilities.social,
  });
}

type Target = { kind: 'post'; post: Post } | { kind: 'discover'; item: DiscoverItem };

/** Bookmark toggle for posts and Discover items, with the "Saved for later · View saved" toast. */
export function useToggleSave() {
  const toast = useToast();
  return useMutation({
    mutationFn: ({ target, saved }: { target: Target; saved: boolean }) =>
      api.saved.set(
        target.kind === 'post' ? { kind: 'post', id: target.post.id } : { kind: 'discover', id: target.item.id },
        saved,
      ),
    onMutate: async ({ target, saved }) => {
      const restore = snapshot([keys.feedAll, ['profile'], keys.discoverAll, keys.saved]);
      if (target.kind === 'post') updatePostEverywhere(target.post.id, (p) => ({ ...p, savedByMe: saved }));
      else updateDiscoverEverywhere(target.item.id, (i) => ({ ...i, savedByMe: saved }));
      return { restore };
    },
    onError: (_e, _v, ctx) => {
      ctx?.restore();
      toast.show({ message: describeError(_e) });
    },
    onSuccess: (_r, { saved }) => {
      if (saved) toast.show({ message: 'Saved for later', action: { label: 'View saved', onPress: () => router.push('/saved') } });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.saved }),
  });
}
