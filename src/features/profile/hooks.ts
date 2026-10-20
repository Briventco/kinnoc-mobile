import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import type { ProfileUpdate } from '@/api/types';
import { nextCursor } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.profile.me() });
}

export function useUserPosts(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.userPosts(userId ?? ''),
    queryFn: ({ pageParam }) => api.profile.posts(userId!, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled: !!userId,
  });
}

export function useUserCommunities(userId: string | undefined) {
  return useQuery({
    queryKey: keys.userCommunities(userId ?? ''),
    queryFn: () => api.communities.ofUser(userId!),
    enabled: !!userId,
  });
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (changes: ProfileUpdate) => api.profile.update(changes),
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.me, profile);
      void queryClient.invalidateQueries({ queryKey: keys.feedAll });
    },
  });
}
