import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import type { CommunityBrowseFilter, DiscoverFilter, FeedScope, MembershipStatus } from '@/api/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Retry only failures that can succeed on a second try.
      retry: (count, error) => (error instanceof ApiError ? error.retryable : true) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Every cache key in one place, so invalidation stays consistent. */
export const keys = {
  feed: (scope: FeedScope) => ['feed', scope] as const,
  feedAll: ['feed'] as const,
  post: (id: string) => ['post', id] as const,
  comments: (id: string) => ['post', id, 'comments'] as const,
  inbox: ['inbox'] as const,
  account: ['account'] as const,
  communityBrowse: (f: CommunityBrowseFilter) => ['communities', 'browse', f.query, f.category] as const,
  categories: ['categories'] as const,
  myCommunities: (status: MembershipStatus) => ['communities', 'mine', status] as const,
  community: (id: string) => ['community', id] as const,
  communityMembers: (id: string) => ['community', id, 'members'] as const,
  joinRequests: (id: string) => ['community', id, 'join-requests'] as const,
  invitations: (id: string) => ['community', id, 'invitations'] as const,
  messages: (communityId: string) => ['messages', communityId] as const,
  discoverHome: ['discover', 'home'] as const,
  discoverList: (filter: DiscoverFilter, q: string) => ['discover', 'list', filter, q] as const,
  discoverAll: ['discover'] as const,
  discoverItem: (id: string) => ['discover', 'item', id] as const,
  me: ['me'] as const,
  profile: (id: string) => ['profile', id] as const,
  userPosts: (id: string) => ['profile', id, 'posts'] as const,
  userCommunities: (id: string) => ['profile', id, 'communities'] as const,
  notifications: ['notifications'] as const,
  unreadNotifications: ['notifications', 'unread'] as const,
  notificationPrefs: ['notification-prefs'] as const,
  saved: ['saved'] as const,
  stories: ['stories'] as const,
};
