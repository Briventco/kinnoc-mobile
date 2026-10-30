import { useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query';

import type { AppNotification, NotificationPreferences, Page } from '@/api/types';
import { nextCursor, snapshot } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api } from '@/services';

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: keys.notifications,
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled: api.capabilities.social,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: keys.unreadNotifications,
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 60_000,
    enabled: api.capabilities.social,
  });
}

function markLocal(predicate: (n: AppNotification) => boolean) {
  queryClient.setQueryData<InfiniteData<Page<AppNotification>>>(keys.notifications, (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((n) => (predicate(n) ? { ...n, read: true } : n)) })) } : d,
  );
}

export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onMutate: (id) => {
      const restore = snapshot([keys.notifications]);
      markLocal((n) => n.id === id);
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.unreadNotifications }),
  });
}

export function useMarkAllNotificationsRead() {
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onMutate: () => {
      const restore = snapshot([keys.notifications, keys.unreadNotifications]);
      markLocal(() => true);
      queryClient.setQueryData(keys.unreadNotifications, 0);
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.unreadNotifications }),
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: keys.notificationPrefs,
    queryFn: () => api.notifications.preferences(),
    enabled: api.capabilities.social,
  });
}

export function useUpdateNotificationPreferences() {
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) => api.notifications.updatePreferences(prefs),
    onMutate: (prefs) => {
      const restore = snapshot([keys.notificationPrefs]);
      queryClient.setQueryData(keys.notificationPrefs, prefs);
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSuccess: (prefs) => queryClient.setQueryData(keys.notificationPrefs, prefs),
  });
}
