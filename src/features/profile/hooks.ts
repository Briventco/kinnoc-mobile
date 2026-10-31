import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import type { Profile, ProfileUpdate } from '@/api/types';
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

/** The public communities someone belongs to (all of yours, for you), by username. */
export function useUserCommunities(username: string | undefined) {
  return useQuery({
    queryKey: keys.userCommunities(username?.toLowerCase() ?? ''),
    queryFn: () => api.communities.ofUser(username!),
    enabled: !!username,
  });
}

/** Anyone's profile by username, as you may see it. */
export function useProfile(username: string | undefined) {
  return useQuery({
    queryKey: keys.profile(username?.toLowerCase() ?? ''),
    queryFn: () => api.profile.get(username!),
    enabled: !!username,
  });
}

/** Everything that shows people's photos: feeds, posts, comments, members, chats and profiles. */
const SHOWS_PHOTOS = [keys.feedAll, ['post'], ['community'], keys.inbox, ['messages'], ['profile']] as const;

function usePhotoChange(change: (localUri?: string) => Promise<Profile>) {
  return useMutation({
    mutationFn: change,
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.me, profile);
      for (const queryKey of SHOWS_PHOTOS) void queryClient.invalidateQueries({ queryKey });
    },
  });
}

/** Uploads a picked image as your profile photo. */
export function useSetAvatar() {
  return usePhotoChange((localUri) => api.profile.setAvatar(localUri!));
}

export function useRemoveAvatar() {
  return usePhotoChange(() => api.profile.removeAvatar());
}

/**
 * Saves the profile form and, where the backend has an interest catalogue, the chosen interests
 * (`interestSlugs`, only when they changed). Two requests: if the second fails, the first has
 * still been saved, so the profile is reloaded either way.
 */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: async ({ interestSlugs, ...changes }: ProfileUpdate & { interestSlugs?: string[] }) => {
      const profile = await api.profile.update(changes);
      return interestSlugs ? api.profile.setInterests(interestSlugs) : profile;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(keys.me, profile);
      void queryClient.invalidateQueries({ queryKey: keys.feedAll });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

/** Replaces your interests (catalogue slugs), for profile setup. */
export function useSetInterests() {
  return useMutation({
    mutationFn: (slugs: string[]) => api.profile.setInterests(slugs),
    onSuccess: (profile) => queryClient.setQueryData(keys.me, profile),
  });
}
