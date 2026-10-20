import { useInfiniteQuery, useMutation, useQuery, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiError } from '@/api/errors';
import type { Community, InboxEntry, Message, Page, Reaction, UserSummary } from '@/api/types';
import { env } from '@/config/env';
import { nextCursor, snapshot } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api, realtime } from '@/services';

/** Until a realtime transport exists, the HTTP build refreshes the inbox and open chat on an interval. */
const POLL_MS = env.apiMode === 'http' ? 15_000 : false;

export function useInbox() {
  return useQuery({ queryKey: keys.inbox, queryFn: () => api.communities.inbox(), refetchInterval: POLL_MS });
}

export function useBrowseCommunities(query: string) {
  return useInfiniteQuery({
    queryKey: keys.communityBrowse(query),
    queryFn: ({ pageParam }) => api.communities.browse(query, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
  });
}

export function useCommunity(id: string) {
  return useQuery({ queryKey: keys.community(id), queryFn: () => api.communities.get(id) });
}

function invalidateMembership(id: string) {
  void queryClient.invalidateQueries({ queryKey: keys.inbox });
  void queryClient.invalidateQueries({ queryKey: ['communities'] });
  void queryClient.invalidateQueries({ queryKey: keys.feedAll });
  void queryClient.invalidateQueries({ queryKey: ['profile'] });
  void queryClient.invalidateQueries({ queryKey: keys.messages(id) });
}

export function useJoinCommunity() {
  return useMutation({
    mutationFn: (id: string) => api.communities.join(id),
    onSuccess: (community) => {
      queryClient.setQueryData(keys.community(community.id), community);
      invalidateMembership(community.id);
    },
  });
}

export function useLeaveCommunity() {
  return useMutation({
    mutationFn: (id: string) => api.communities.leave(id),
    onSuccess: (_r, id) => {
      queryClient.setQueryData<Community>(keys.community(id), (c) => (c ? { ...c, membership: 'none' } : c));
      queryClient.removeQueries({ queryKey: keys.messages(id) });
      invalidateMembership(id);
    },
  });
}

function patchInbox(id: string, fn: (e: InboxEntry) => InboxEntry) {
  queryClient.setQueryData<InboxEntry[]>(keys.inbox, (list) => list?.map((e) => (e.community.id === id ? fn(e) : e)));
}

export function useInboxActions() {
  const mute = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) => api.communities.setMuted(id, muted),
    onMutate: ({ id, muted }) => {
      const restore = snapshot([keys.inbox]);
      patchInbox(id, (e) => ({ ...e, isMuted: muted }));
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.communities.setPinned(id, pinned),
    onMutate: ({ id, pinned }) => {
      const restore = snapshot([keys.inbox]);
      patchInbox(id, (e) => ({ ...e, isPinned: pinned }));
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.inbox }),
  });
  return { mute, pin };
}

export function useMarkCommunityRead() {
  return useMutation({
    mutationFn: ({ id, lastMessageId }: { id: string; lastMessageId: string | null }) => api.communities.markRead(id, lastMessageId),
    onMutate: ({ id }) => patchInbox(id, (e) => ({ ...e, unreadCount: 0, hasMention: false })),
  });
}

/* ---------- Conversation ---------- */

type MessagePages = InfiniteData<Page<Message>>;

/** Message history, newest first, paging back through older messages. Members only. */
export function useMessages(communityId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.messages(communityId),
    queryFn: ({ pageParam }) => api.messages.list(communityId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
    refetchInterval: POLL_MS,
    retry: (count, error) => !(error instanceof ApiError && error.code === 'forbidden') && count < 2,
  });
}

/** Inserts or replaces a message (matched by id or clientId) at the newest end. */
function upsertMessage(communityId: string, message: Message) {
  queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => {
    if (!d) return d;
    const matches = (m: Message) => m.id === message.id || (!!message.clientId && m.clientId === message.clientId);
    const exists = d.pages.some((p) => p.items.some(matches));
    if (exists) {
      return { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((m) => (matches(m) ? message : m)) })) };
    }
    const [first, ...rest] = d.pages;
    return { ...d, pages: [{ ...first, items: [message, ...first.items] }, ...rest] };
  });
}

function patchMessage(communityId: string, id: string, fn: (m: Message) => Message) {
  queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) =>
    d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === id || m.clientId === id ? fn(m) : m)) })) } : d,
  );
}

export interface OutgoingMessage {
  clientId: string;
  text: string;
  replyTo: Message['replyTo'];
  attachmentUris: string[];
}

/**
 * Sends with an optimistic bubble: "Sending" → "Sent", or "Not sent. Tap to retry".
 * Retrying reuses the same clientId so the server can de-duplicate.
 */
export function useSendMessage(communityId: string, me: UserSummary | undefined) {
  return useMutation({
    mutationFn: (out: OutgoingMessage) =>
      api.messages.send({
        communityId,
        clientId: out.clientId,
        text: out.text,
        replyToId: out.replyTo?.id ?? null,
        attachmentUris: out.attachmentUris,
      }),
    onMutate: async (out) => {
      await queryClient.cancelQueries({ queryKey: keys.messages(communityId) });
      upsertMessage(communityId, {
        id: out.clientId,
        clientId: out.clientId,
        communityId,
        sender: me ?? { id: 'me', displayName: 'You', username: '', avatarUrl: null },
        isMine: true,
        text: out.text,
        sentAt: new Date().toISOString(),
        replyTo: out.replyTo,
        attachments: out.attachmentUris.map((uri, i) => ({ id: `${out.clientId}_${i}`, kind: 'image', url: uri, width: 1200, height: 900 })),
        link: null,
        reactions: [],
        status: 'sending',
      });
    },
    onSuccess: (message) => {
      upsertMessage(communityId, message);
      void queryClient.invalidateQueries({ queryKey: keys.inbox });
    },
    onError: (_e, out) => patchMessage(communityId, out.clientId, (m) => ({ ...m, status: 'failed' })),
  });
}

export function useReact(communityId: string) {
  return useMutation({
    mutationFn: ({ messageId, emoji, add }: { messageId: string; emoji: string; add: boolean }) =>
      api.messages.react(messageId, emoji, add),
    onMutate: ({ messageId, emoji, add }) => {
      const restore = snapshot([keys.messages(communityId)]);
      patchMessage(communityId, messageId, (m) => {
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
      });
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSuccess: (reactions, { messageId }) => patchMessage(communityId, messageId, (m) => ({ ...m, reactions })),
  });
}

/** Subscribes the open conversation to realtime events and merges them into the cache. */
export function useConversationEvents(communityId: string, enabled: boolean) {
  const [typing, setTyping] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    return realtime.subscribe(communityId, (event) => {
      switch (event.type) {
        case 'message':
          upsertMessage(communityId, event.message);
          break;
        case 'reactions':
          patchMessage(communityId, event.messageId, (m) => ({ ...m, reactions: event.reactions }));
          break;
        case 'typing':
          setTyping(event.names);
          break;
        case 'read':
          queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) =>
            d
              ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.isMine && m.status === 'sent' ? { ...m, status: 'read' } : m)) })) }
              : d,
          );
          break;
      }
    });
  }, [communityId, enabled]);
  return { typing };
}
