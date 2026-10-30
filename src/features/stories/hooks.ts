import { useMutation, useQuery } from '@tanstack/react-query';

import type { CreateStoryInput, StoryReel } from '@/api/types';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useStories() {
  return useQuery({
    queryKey: keys.stories,
    queryFn: () => api.stories.list(),
    refetchInterval: 5 * 60_000,
    enabled: api.capabilities.social,
  });
}

export function useCreateStory() {
  return useMutation({
    mutationFn: (input: CreateStoryInput) => api.stories.create(input),
    onSuccess: (mine) => {
      queryClient.setQueryData<StoryReel[]>(keys.stories, (list) => (list ? list.map((r) => (r.isMine ? mine : r)) : [mine]));
    },
  });
}

/** Seen state is cosmetic, so it is applied locally at once and never rolled back. */
export function useMarkStorySeen() {
  return useMutation({
    mutationFn: (frameId: string) => api.stories.markSeen(frameId),
    onMutate: (frameId) => {
      queryClient.setQueryData<StoryReel[]>(keys.stories, (list) =>
        list?.map((r) => {
          const last = r.frames[r.frames.length - 1];
          return !r.isMine && last?.id === frameId ? { ...r, seen: true } : r;
        }),
      );
    },
  });
}
