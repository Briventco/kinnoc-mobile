import { skipToken, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ApiError } from '@/api/errors';
import type { ConversationEvent } from '@/api/realtime';
import type {
  CommunityGroup,
  CommunityGroupInput,
  CommunityGroupsList,
  GroupRole,
  Message,
  Person,
  Reaction,
  Receipts,
} from '@/api/types';
import { env } from '@/config/env';
import { nextCursor, snapshot } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api, realtime } from '@/services';

import { lostAccess, type OutgoingMessage } from './hooks';
import { markDeleted, maxSeq, mergeMessages, patchMessage, type MessagePages } from './messageCache';
import { mergeReceipts } from './receipts';

const GROUP_MESSAGE_POLL_MS = env.apiMode === 'http' && !realtime.live ? 15_000 : false;
const groupChannel = (groupId: string) => `group:${groupId}`;

function invalidateGroups(communityId: string, groupId?: string) {
  void queryClient.invalidateQueries({ queryKey: keys.communityGroups(communityId) });
  if (groupId) {
    void queryClient.invalidateQueries({ queryKey: keys.communityGroup(communityId, groupId) });
    void queryClient.invalidateQueries({ queryKey: keys.groupMembers(communityId, groupId) });
  }
}

export function useCommunityGroups(communityId: string, enabled = true) {
  return useQuery({
    queryKey: keys.communityGroups(communityId),
    queryFn: () => api.groups.list(communityId),
    enabled: enabled && api.capabilities.communityGroups,
    retry: (count, error) =>
      !(error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden' || error.code === 'unsupported')) &&
      count < 2,
  });
}

export function useCommunityGroup(communityId: string, groupId: string, enabled = true) {
  return useQuery({
    queryKey: keys.communityGroup(communityId, groupId),
    queryFn: () => api.groups.get(communityId, groupId),
    enabled: enabled && api.capabilities.communityGroups,
    retry: (count, error) =>
      !(error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden' || error.code === 'unsupported')) &&
      count < 2,
  });
}

export function useCreateGroup(communityId: string) {
  return useMutation({
    mutationFn: (input: CommunityGroupInput) => api.groups.create(communityId, input),
    onSuccess: (created) => {
      queryClient.setQueryData(keys.communityGroup(communityId, created.id), created);
      invalidateGroups(communityId);
    },
  });
}

export function useUpdateGroup(communityId: string, groupId: string) {
  return useMutation({
    mutationFn: (changes: Partial<CommunityGroupInput>) => api.groups.update(communityId, groupId, changes),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.communityGroup(communityId, groupId), updated);
      invalidateGroups(communityId);
    },
  });
}

export function useDeleteGroup(communityId: string, groupId: string) {
  return useMutation({
    mutationFn: () => api.groups.remove(communityId, groupId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.communityGroup(communityId, groupId) });
      queryClient.removeQueries({ queryKey: keys.groupMessages(groupId) });
      invalidateGroups(communityId);
    },
  });
}

export function useJoinGroup(communityId: string) {
  return useMutation({
    mutationFn: (groupId: string) => api.groups.join(communityId, groupId),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.communityGroup(communityId, updated.id), updated);
      invalidateGroups(communityId, updated.id);
    },
  });
}

export function useLeaveGroup(communityId: string) {
  return useMutation({
    mutationFn: (groupId: string) => api.groups.leave(communityId, groupId),
    onSuccess: (_res, groupId) => {
      queryClient.removeQueries({ queryKey: keys.groupMessages(groupId) });
      invalidateGroups(communityId, groupId);
    },
  });
}

export function useGroupMembers(communityId: string, groupId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.groupMembers(communityId, groupId),
    queryFn: ({ pageParam }) => api.groups.members(communityId, groupId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled: enabled && api.capabilities.communityGroups,
  });
}

export function useGroupAdmin(communityId: string, groupId: string) {
  const refresh = () => invalidateGroups(communityId, groupId);
  return {
    addMember: useMutation({
      mutationFn: ({ username, role }: { username: string; role?: GroupRole }) =>
        api.groups.addMember(communityId, groupId, username, role),
      onSuccess: refresh,
    }),
    setMemberRole: useMutation({
      mutationFn: ({ username, role }: { username: string; role: GroupRole }) =>
        api.groups.setMemberRole(communityId, groupId, username, role),
      onSuccess: refresh,
    }),
    removeMember: useMutation({
      mutationFn: (username: string) => api.groups.removeMember(communityId, groupId, username),
      onSuccess: refresh,
    }),
  };
}

export function useMuteGroup(communityId: string, groupId: string) {
  return useMutation({
    mutationFn: (muted: boolean) => api.groups.setMuted(communityId, groupId, muted),
    onMutate: (muted) => {
      const restore = snapshot([keys.communityGroup(communityId, groupId), keys.communityGroups(communityId)]);
      queryClient.setQueryData<CommunityGroup>(keys.communityGroup(communityId, groupId), (g) =>
        g ? { ...g, isMuted: muted } : g,
      );
      queryClient.setQueryData<CommunityGroupsList>(keys.communityGroups(communityId), (list) =>
        list ? { ...list, items: list.items.map((g) => (g.id === groupId ? { ...g, isMuted: muted } : g)) } : list,
      );
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
  });
}

export function useMarkGroupRead(communityId: string, groupId: string) {
  return useMutation({
    mutationFn: (lastMessageId: string | null) => api.groups.markRead(communityId, groupId, lastMessageId),
    onMutate: () => {
      queryClient.setQueryData<CommunityGroup>(keys.communityGroup(communityId, groupId), (g) =>
        g ? { ...g, unreadCount: 0 } : g,
      );
      queryClient.setQueryData<CommunityGroupsList>(keys.communityGroups(communityId), (list) =>
        list ? { ...list, items: list.items.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)) } : list,
      );
    },
  });
}

/* ---------- Group Receipts & Messaging ---------- */

export function setGroupReceipts(groupId: string, next: Receipts | null | undefined) {
  if (!next) return;
  queryClient.setQueryData<Receipts | null>(keys.groupReceipts(groupId), (current) => mergeReceipts(current, next));
}

export function useGroupReceipts(groupId: string): Receipts | null {
  const { data } = useQuery<Receipts | null>({
    queryKey: keys.groupReceipts(groupId),
    queryFn: skipToken,
    staleTime: Infinity,
  });
  return data ?? null;
}

export async function loadGroupMessages(communityId: string, groupId: string, cursor: string | null) {
  const page = await api.groups.messages(communityId, groupId, cursor);
  setGroupReceipts(groupId, page.receipts);
  return page;
}

export function useGroupMessages(communityId: string, groupId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.groupMessages(groupId),
    queryFn: ({ pageParam }) => loadGroupMessages(communityId, groupId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
    refetchInterval: GROUP_MESSAGE_POLL_MS,
    staleTime: realtime.live ? Infinity : undefined,
    retry: (count, error) => !(error instanceof ApiError && (error.code === 'forbidden' || error.code === 'not_found')) && count < 2,
  });
}

const mergeGroup = (groupId: string, messages: Message[]) =>
  queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) => mergeMessages(d, messages));

const catchingUpGroups = new Map<string, Promise<void>>();

export function catchUpGroup(communityId: string, groupId: string, serverLastSeq: number) {
  const running = catchingUpGroups.get(groupId);
  if (running) return running;
  const run = (async () => {
    const data = queryClient.getQueryData<MessagePages>(keys.groupMessages(groupId));
    const known = maxSeq(data);
    if (!data || known === null || serverLastSeq <= known) return;
    const page = await api.groups.messagesSince(communityId, groupId, known);
    mergeGroup(groupId, page.items);
    setGroupReceipts(groupId, page.receipts);
  })()
    .catch(() => {
      void queryClient.invalidateQueries({ queryKey: keys.groupMessages(groupId), refetchType: 'active' });
    })
    .finally(() => catchingUpGroups.delete(groupId));
  catchingUpGroups.set(groupId, run);
  return run;
}

export function useSendGroupMessage(groupId: string, communityId: string, me: Person | undefined) {
  const mutate = useCallback(
    (out: OutgoingMessage, options?: { onError?: (error: unknown) => void }) => {
      const pending: Message = {
        id: out.clientId,
        clientId: out.clientId,
        communityId: groupId,
        seq: null,
        sender: me ? { username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl } : null,
        isMine: true,
        text: out.text,
        sentAt: new Date().toISOString(),
        deletedAt: null,
        replyTo: out.replyTo,
        attachments: out.attachmentUris.map((uri, i) => ({
          id: `${out.clientId}_${i}`,
          kind: 'image',
          url: uri,
          width: 1200,
          height: 900,
        })),
        link: null,
        reactions: [],
        status: 'sending',
      };

      queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) =>
        mergeMessages(
          patchMessage(d, out.clientId, (m) => ({ ...m, status: 'sending' })),
          [pending],
        ),
      );

      void (async () => {
        try {
          const res = await api.groups.sendMessage(communityId, groupId, {
            clientId: out.clientId,
            text: out.text,
            replyToId: out.replyTo?.id ?? null,
            attachmentUris: out.attachmentUris,
          });
          const confirmed: Message = {
            ...res,
            clientId: res.clientId ?? out.clientId,
            isMine: true,
            status: 'sent',
          };
          mergeGroup(groupId, [confirmed]);
          void queryClient.invalidateQueries({ queryKey: keys.communityGroups(communityId) });
        } catch (error) {
          queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) =>
            patchMessage(d, out.clientId, (m) => ({ ...m, status: 'failed' })),
          );
          if (lostAccess(error)) {
            void queryClient.invalidateQueries({ queryKey: keys.communityGroup(communityId, groupId) });
          }
          options?.onError?.(error);
        }
      })();
    },
    [groupId, communityId, me],
  );

  return useMemo(() => ({ mutate }), [mutate]);
}

export function useDeleteGroupMessage(communityId: string, groupId: string) {
  return useMutation({
    mutationFn: (messageId: string) => api.groups.removeMessage(communityId, groupId, messageId),
    onMutate: (messageId) => {
      const restore = snapshot([keys.groupMessages(groupId)]);
      queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) => markDeleted(d, messageId));
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
  });
}

export function useGroupReact(groupId: string) {
  return useMutation({
    mutationFn: ({ messageId, emoji, add }: { messageId: string; emoji: string; add: boolean }) =>
      api.messages.react(messageId, emoji, add),
    onMutate: ({ messageId, emoji, add }) => {
      const restore = snapshot([keys.groupMessages(groupId)]);
      queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) =>
        patchMessage(d, messageId, (m) => {
          const has = m.reactions.find((r) => r.emoji === emoji);
          let reactions: Reaction[];
          if (add) {
            reactions = has
              ? m.reactions.map((r) => (r.emoji === emoji && !r.reactedByMe ? { ...r, count: r.count + 1, reactedByMe: true } : r))
              : [...m.reactions, { emoji, count: 1, reactedByMe: true }];
          } else {
            reactions = m.reactions
              .map((r) => (r.emoji === emoji && r.reactedByMe ? { ...r, count: r.count - 1, reactedByMe: false } : r))
              .filter((r) => r.count > 0);
          }
          return { ...m, reactions };
        }),
      );
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSuccess: (reactions, { messageId }) =>
      queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) =>
        patchMessage(d, messageId, (m) => ({ ...m, reactions })),
      ),
  });
}

export function useGroupConversationEvents(groupId: string, communityId: string, enabled: boolean, onLostAccess?: () => void) {
  const [typing, setTyping] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = realtime.subscribe(groupChannel(groupId), (event: ConversationEvent) => {
      switch (event.type) {
        case 'message':
          mergeGroup(groupId, [event.message]);
          break;
        case 'deleted':
          queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) => markDeleted(d, event.messageId));
          break;
        case 'reactions':
          queryClient.setQueryData<MessagePages>(keys.groupMessages(groupId), (d) =>
            patchMessage(d, event.messageId, (m) => ({ ...m, reactions: event.reactions })),
          );
          break;
        case 'typing':
          setTyping(event.names);
          break;
        case 'read':
          void queryClient.invalidateQueries({ queryKey: keys.communityGroups(communityId) });
          break;
        case 'subscribed':
          setGroupReceipts(groupId, event.receipts);
          void catchUpGroup(communityId, groupId, event.lastSeq);
          break;
        case 'receipts':
          setGroupReceipts(groupId, event.receipts);
          break;
        case 'ended':
          queryClient.removeQueries({ queryKey: keys.groupReceipts(groupId) });
          onLostAccess?.();
          break;
        case 'error':
          if (event.code === 'MEMBERSHIP_REQUIRED' || event.code === 'GROUP_NOT_FOUND' || event.code === 'COMMUNITY_NOT_FOUND') {
            onLostAccess?.();
          }
          break;
      }
    });
    return () => {
      unsubscribe();
      setTyping([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, communityId, enabled]);
  return { typing };
}
