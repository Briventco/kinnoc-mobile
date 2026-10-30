import { skipToken, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { ApiError } from '@/api/errors';
import type { ConversationEvent } from '@/api/realtime';
import type {
  Community,
  CommunityBrowseFilter,
  CommunityInput,
  CommunityRole,
  InboxEntry,
  Message,
  Person,
  Reaction,
  Receipts,
} from '@/api/types';
import { env } from '@/config/env';
import { nextCursor, snapshot } from '@/lib/cache';
import { keys, queryClient } from '@/lib/query';
import { api, realtime } from '@/services';

import { withLiveMessage } from './inboxCache';
import { markDeleted, maxSeq, mergeMessages, patchMessage, type MessagePages } from './messageCache';
import { mergeReceipts } from './receipts';

/**
 * The inbox is live for the communities it lists (`useInboxLive`); polling picks up new
 * memberships and anything missed while disconnected.
 */
const INBOX_POLL_MS = env.apiMode === 'http' ? (realtime.live ? 30_000 : 15_000) : false;
/** Conversations poll only when there is no live transport. */
const MESSAGE_POLL_MS = env.apiMode === 'http' && !realtime.live ? 15_000 : false;

const isCode = (error: unknown, ...codes: string[]) => error instanceof ApiError && !!error.serverCode && codes.includes(error.serverCode);

/** Errors that mean the viewer can no longer read a community's conversation. */
export const lostAccess = (error: unknown) => isCode(error, 'MEMBERSHIP_REQUIRED', 'COMMUNITY_NOT_FOUND');

/** The inbox, recording each conversation's receipts on the way. */
export async function loadInbox() {
  const entries = await api.communities.inbox();
  entries.forEach((e) => setReceipts(e.community.id, e.receipts));
  return entries;
}

export function useInbox() {
  return useQuery({ queryKey: keys.inbox, queryFn: loadInbox, refetchInterval: INBOX_POLL_MS });
}

export function useBrowseCommunities(filter: CommunityBrowseFilter) {
  return useInfiniteQuery({
    queryKey: keys.communityBrowse(filter),
    queryFn: ({ pageParam }) => api.communities.browse(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
  });
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => api.communities.categories(), staleTime: 60 * 60_000 });
}

export function useCommunity(id: string, enabled = true) {
  return useQuery({
    queryKey: keys.community(id),
    queryFn: () => api.communities.get(id),
    enabled,
    // A community the viewer cannot see stays hidden; retrying will not change that.
    retry: (count, error) => !(error instanceof ApiError && (error.code === 'not_found' || error.code === 'forbidden')) && count < 2,
  });
}

/** Invitations waiting for the viewer, or requests they have sent. */
export function useMyCommunities(status: 'invited' | 'pending') {
  return useQuery({
    queryKey: keys.myCommunities(status),
    queryFn: async () => (await api.communities.mine(status, null)).items,
    refetchInterval: INBOX_POLL_MS,
  });
}

/** Refreshes everything that depends on the viewer's membership of a community. */
function invalidateMembership(id: string) {
  void queryClient.invalidateQueries({ queryKey: keys.inbox });
  void queryClient.invalidateQueries({ queryKey: ['communities'] });
  void queryClient.invalidateQueries({ queryKey: ['community', id] });
  void queryClient.invalidateQueries({ queryKey: keys.feedAll });
  void queryClient.invalidateQueries({ queryKey: ['profile'] });
  void queryClient.invalidateQueries({ queryKey: keys.me });
}

function setMembership(id: string, membership: Community['membership'], role: CommunityRole | null = null) {
  queryClient.setQueryData<Community>(keys.community(id), (c) => (c ? { ...c, membership, role } : c));
}

export function useJoinCommunity() {
  return useMutation({
    mutationFn: (id: string) => api.communities.join(id),
    onSuccess: (community, id) => {
      queryClient.setQueryData(keys.community(id), community);
      queryClient.setQueryData(keys.community(community.id), community);
      invalidateMembership(community.id);
    },
  });
}

export function useLeaveCommunity() {
  return useMutation({
    mutationFn: (id: string) => api.communities.leave(id),
    onSuccess: (_r, id) => {
      setMembership(id, 'none');
      queryClient.removeQueries({ queryKey: keys.messages(id) });
      invalidateMembership(id);
    },
  });
}

export function useCancelRequest() {
  return useMutation({
    mutationFn: (id: string) => api.communities.cancelRequest(id),
    onSuccess: (_r, id) => {
      setMembership(id, 'none');
      invalidateMembership(id);
    },
  });
}

export function useDeclineInvitation() {
  return useMutation({
    mutationFn: (id: string) => api.communities.declineInvitation(id),
    onSuccess: (_r, id) => {
      setMembership(id, 'none');
      invalidateMembership(id);
    },
  });
}

export function useCreateCommunity() {
  return useMutation({
    mutationFn: (input: CommunityInput) => api.communities.create(input),
    onSuccess: (community) => {
      queryClient.setQueryData(keys.community(community.id), community);
      invalidateMembership(community.id);
    },
  });
}

export function useUpdateCommunity(id: string) {
  return useMutation({
    mutationFn: (changes: Partial<CommunityInput>) => api.communities.update(id, changes),
    onSuccess: (community) => {
      queryClient.setQueryData(keys.community(id), community);
      void queryClient.invalidateQueries({ queryKey: keys.inbox });
      void queryClient.invalidateQueries({ queryKey: ['communities'] });
    },
  });
}

export function useUploadCommunityImage() {
  return useMutation({ mutationFn: (localUri: string) => api.media.uploadCommunityImage(localUri) });
}

/* ---------- Members, requests and invitations ---------- */

export function useMembers(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.communityMembers(id),
    queryFn: ({ pageParam }) => api.communities.members(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
  });
}

export function useJoinRequests(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.joinRequests(id),
    queryFn: ({ pageParam }) => api.communities.joinRequests(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
  });
}

export function useInvitations(id: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.invitations(id),
    queryFn: ({ pageParam }) => api.communities.invitations(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
  });
}

/** Manager actions. Each refreshes the lists and the community (counts, roles) afterwards. */
export function useCommunityAdmin(id: string) {
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['community', id] });
  return {
    setRole: useMutation({
      mutationFn: ({ username, role }: { username: string; role: Exclude<CommunityRole, 'owner'> }) => api.communities.setRole(id, username, role),
      onSettled: refresh,
    }),
    remove: useMutation({ mutationFn: (username: string) => api.communities.removeMember(id, username), onSettled: refresh }),
    transfer: useMutation({ mutationFn: (username: string) => api.communities.transferOwnership(id, username), onSettled: refresh }),
    approve: useMutation({ mutationFn: (username: string) => api.communities.approveRequest(id, username), onSettled: refresh }),
    reject: useMutation({ mutationFn: (username: string) => api.communities.rejectRequest(id, username), onSettled: refresh }),
    invite: useMutation({ mutationFn: (username: string) => api.communities.invite(id, username), onSettled: refresh }),
    revoke: useMutation({ mutationFn: (username: string) => api.communities.revokeInvitation(id, username), onSettled: refresh }),
  };
}

/* ---------- Inbox ---------- */

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

/* ---------- Receipts ---------- */

/** Records a conversation's Delivered and Seen positions, keeping the highest seen so far. */
export function setReceipts(communityId: string, next: Receipts | null | undefined) {
  if (!next) return;
  queryClient.setQueryData<Receipts | null>(keys.receipts(communityId), (current) => mergeReceipts(current, next));
}

/** Receipts for the inbox row as well as the conversation, from live events. */
function setLiveReceipts(communityId: string, next: Receipts | null) {
  setReceipts(communityId, next);
  if (next) patchInbox(communityId, (e) => ({ ...e, receipts: mergeReceipts(e.receipts, next) }));
}

/**
 * The conversation's receipt positions, from message pages, the inbox and live events. Null until
 * the backend has provided any (the delivery line then shows one tick).
 */
export function useReceipts(communityId: string): Receipts | null {
  const { data } = useQuery<Receipts | null>({ queryKey: keys.receipts(communityId), queryFn: skipToken, staleTime: Infinity });
  return data ?? null;
}

/* ---------- Conversation ---------- */

/** One page of history, recording the conversation's receipts on the way. */
export async function loadMessages(communityId: string, cursor: string | null) {
  const page = await api.messages.list(communityId, cursor);
  setReceipts(communityId, page.receipts);
  return page;
}

/** Message history, newest first, paging back through older messages. Members only. */
export function useMessages(communityId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: keys.messages(communityId),
    queryFn: ({ pageParam }) => loadMessages(communityId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor,
    enabled,
    refetchInterval: MESSAGE_POLL_MS,
    // With a live transport, missed messages are fetched by catch-up instead of refetching history.
    staleTime: realtime.live ? Infinity : undefined,
    retry: (count, error) => !(error instanceof ApiError && (error.code === 'forbidden' || error.code === 'not_found')) && count < 2,
  });
}

const merge = (communityId: string, messages: Message[]) =>
  queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => mergeMessages(d, messages));

/** One catch-up at a time per conversation. */
const catchingUp = new Map<string, Promise<void>>();

/**
 * Fetches messages newer than the newest one cached, following `nextCursor` to the end. Sequence
 * numbers have no gaps, so nothing sent while disconnected is missed; overlap with live events is
 * dropped by `mergeMessages`.
 */
export function catchUp(communityId: string, serverLastSeq: number) {
  const running = catchingUp.get(communityId);
  if (running) return running;
  const run = (async () => {
    const data = queryClient.getQueryData<MessagePages>(keys.messages(communityId));
    const known = maxSeq(data);
    // Nothing cached yet: the initial load fetches the latest page anyway.
    if (!data || known === null || serverLastSeq <= known) return;
    let cursor: string | null = null;
    do {
      const page = await api.messages.since(communityId, known, cursor);
      merge(communityId, page.items);
      setReceipts(communityId, page.receipts);
      cursor = page.nextCursor;
    } while (cursor);
  })()
    .catch(() => {
      // A failed catch-up falls back to refetching the newest page.
      void queryClient.invalidateQueries({ queryKey: keys.messages(communityId), refetchType: 'active' });
    })
    .finally(() => catchingUp.delete(communityId));
  catchingUp.set(communityId, run);
  return run;
}

export interface OutgoingMessage {
  clientId: string;
  text: string;
  replyTo: Message['replyTo'];
  attachmentUris: string[];
}

/**
 * Sends with an optimistic bubble: "Sending" → "Sent", or "Not sent. Tap to retry".
 * Retrying reuses the same clientId so the server returns the original instead of a duplicate.
 */
export function useSendMessage(communityId: string, me: Person | undefined) {
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
      const pending: Message = {
        id: out.clientId,
        clientId: out.clientId,
        communityId,
        seq: null,
        sender: me ? { username: me.username, displayName: me.displayName, avatarUrl: me.avatarUrl } : null,
        isMine: true,
        text: out.text,
        sentAt: new Date().toISOString(),
        deletedAt: null,
        replyTo: out.replyTo,
        attachments: out.attachmentUris.map((uri, i) => ({ id: `${out.clientId}_${i}`, kind: 'image', url: uri, width: 1200, height: 900 })),
        link: null,
        reactions: [],
        status: 'sending',
      };
      // A retry replaces the failed bubble instead of adding a second one.
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) =>
        mergeMessages(
          patchMessage(d, out.clientId, (m) => ({ ...m, status: 'sending' })),
          [pending],
        ),
      );
    },
    onSuccess: (message) => {
      merge(communityId, [message]);
      void queryClient.invalidateQueries({ queryKey: keys.inbox });
    },
    onError: (error, out) => {
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => patchMessage(d, out.clientId, (m) => ({ ...m, status: 'failed' })));
      if (lostAccess(error)) void queryClient.invalidateQueries({ queryKey: keys.community(communityId) });
    },
  });
}

/** Sender, owner or moderator. The bubble shows "Message deleted" at once and is restored on failure. */
export function useDeleteMessage(communityId: string) {
  return useMutation({
    mutationFn: (messageId: string) => api.messages.remove(communityId, messageId),
    onMutate: (messageId) => {
      const restore = snapshot([keys.messages(communityId)]);
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => markDeleted(d, messageId));
      return { restore };
    },
    onError: (_e, _v, ctx) => ctx?.restore(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.inbox }),
  });
}

export function useReact(communityId: string) {
  return useMutation({
    mutationFn: ({ messageId, emoji, add }: { messageId: string; emoji: string; add: boolean }) =>
      api.messages.react(messageId, emoji, add),
    onMutate: ({ messageId, emoji, add }) => {
      const restore = snapshot([keys.messages(communityId)]);
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) =>
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
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => patchMessage(d, messageId, (m) => ({ ...m, reactions }))),
  });
}

/**
 * Subscribes the open conversation to realtime events and merges them into the cache: new and
 * deleted messages, typing, the viewer's read position, catch-up after every (re)subscription,
 * and the end of membership (`onLostAccess`).
 */
export function useConversationEvents(communityId: string, enabled: boolean, onLostAccess?: () => void) {
  const [typing, setTyping] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = realtime.subscribe(communityId, (event) => applyConversationEvent(communityId, event, { onTyping: setTyping, onLostAccess }));
    return () => {
      unsubscribe();
      setTyping([]);
    };
    // onLostAccess is read when an event arrives; resubscribing on every render is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, enabled]);
  return { typing };
}

/** Merges one realtime event of an open conversation into the cache. */
export function applyConversationEvent(
  communityId: string,
  event: ConversationEvent,
  handlers: { onTyping: (names: string[]) => void; onLostAccess?: () => void },
) {
  switch (event.type) {
    case 'message':
      merge(communityId, [event.message]);
      break;
    case 'deleted':
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => markDeleted(d, event.messageId));
      break;
    case 'reactions':
      queryClient.setQueryData<MessagePages>(keys.messages(communityId), (d) => patchMessage(d, event.messageId, (m) => ({ ...m, reactions: event.reactions })));
      break;
    case 'typing':
      handlers.onTyping(event.names);
      break;
    case 'read':
      patchInbox(communityId, (e) => ({ ...e, unreadCount: 0, hasMention: false }));
      break;
    case 'subscribed':
      setLiveReceipts(communityId, event.receipts);
      void catchUp(communityId, event.lastSeq);
      break;
    case 'receipts':
      setLiveReceipts(communityId, event.receipts);
      break;
    case 'ended':
      queryClient.removeQueries({ queryKey: keys.receipts(communityId) });
      handlers.onLostAccess?.();
      break;
    case 'error':
      if (event.code === 'MEMBERSHIP_REQUIRED' || event.code === 'COMMUNITY_NOT_FOUND') handlers.onLostAccess?.();
      break;
  }
}

/**
 * Keeps the inbox live while it is on screen: subscribes to every listed community so rows show
 * new messages, unread counts and who is typing as it happens. Live messages also go into any
 * cached conversation, so opening it later shows them at once.
 */
export function useInboxLive(communityIds: string[]) {
  const key = [...communityIds].sort().join(',');
  useEffect(() => {
    if (!realtime.live || !key) return;
    const unsubscribes = key.split(',').map((id) => realtime.subscribe(id, (event) => applyInboxEvent(id, event)));
    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      queryClient.setQueryData<InboxEntry[]>(keys.inbox, (entries) => entries?.map((e) => (e.typing.length ? { ...e, typing: [] } : e)));
    };
  }, [key]);
}

/** Merges one realtime event into the inbox row of its community (and its cached conversation). */
export function applyInboxEvent(id: string, event: ConversationEvent) {
  switch (event.type) {
    case 'message':
      merge(id, [event.message]);
      queryClient.setQueryData<InboxEntry[]>(keys.inbox, (entries) => withLiveMessage(entries, id, event.message));
      break;
    case 'deleted':
      queryClient.setQueryData<MessagePages>(keys.messages(id), (d) => markDeleted(d, event.messageId));
      break;
    case 'typing':
      patchInbox(id, (e) => ({ ...e, typing: event.names }));
      break;
    case 'read':
      patchInbox(id, (e) => ({ ...e, unreadCount: 0, hasMention: false }));
      break;
    case 'subscribed':
    case 'receipts':
      setLiveReceipts(id, event.receipts);
      break;
    case 'ended':
      queryClient.removeQueries({ queryKey: keys.receipts(id) });
      void queryClient.invalidateQueries({ queryKey: keys.inbox });
      break;
  }
}

/** The live connection's state, for a quiet "Connecting…" hint. */
export function useRealtimeStatus() {
  return useSyncExternalStore(realtime.onStatus, realtime.status, realtime.status);
}
