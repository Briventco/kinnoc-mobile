import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

import type { ConversationEvent, RealtimeClient, RealtimeStatus } from '../realtime';
import { type ApiMessage, type ApiReceipts, toMessage, toReceipts } from './mappers';

type Listener = (event: ConversationEvent) => void;
type Ack<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export interface SocketRealtimeOptions {
  /** Server origin, e.g. `https://kinnoc-api.onrender.com`. The namespace is `/chat`. */
  url: string;
  /** Socket.IO path, e.g. `/api/v1/socket.io`. */
  path: string;
  getAccessToken: (options?: { refresh?: boolean }) => Promise<string | null>;
  /** Injectable for tests. */
  connect?: (uri: string, options: Partial<ManagerOptions & SocketOptions>) => Socket;
  /** React Native's AppState: the connection closes in the background and reopens in the foreground. */
  appState?: { addEventListener(type: 'change', fn: (state: string) => void): { remove(): void } };
}

/** Handshake refusals that a fresh access token can fix. */
const TOKEN_PROBLEMS = new Set(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_MISSING']);
const TYPING_TTL_MS = 5000;
const IDLE_DISCONNECT_MS = 30_000;
const ACK_TIMEOUT_MS = 10_000;
const MAX_HANDSHAKE_RETRIES = 4;
/** Live messages arriving within this window share one `delivered` acknowledgement. */
const DELIVERED_BATCH_MS = 500;
/** Refusals that mean the conversation is closed to the viewer: stop acknowledging it. */
const ACCESS_ENDED = new Set(['MEMBERSHIP_REQUIRED', 'GROUP_MEMBERSHIP_REQUIRED', 'COMMUNITY_NOT_FOUND', 'GROUP_NOT_FOUND']);
const GROUP_PREFIX = 'group:';
const isGroupChannel = (id: string) => id.startsWith(GROUP_PREFIX);
const groupChannelId = (groupId: string) => `${GROUP_PREFIX}${groupId}`;
const channelTarget = (id: string): { communityId?: string; groupId?: string } =>
  isGroupChannel(id) ? { groupId: id.slice(GROUP_PREFIX.length) } : { communityId: id };

/**
 * Community chat over the API's Socket.IO gateway (docs/chat.md section 5).
 *
 * - One connection, opened when the first conversation subscribes and closed 30 s after the
 *   last one leaves, or when the app goes to the background.
 * - The access token goes in the handshake `auth` payload, fetched on every (re)connect, so
 *   reconnects use a refreshed token. The server disconnects when the token expires
 *   (`session:expired`); the client reconnects with a fresh one.
 * - After every (re)connect each open conversation subscribes again; the acknowledgement's
 *   `lastSeq` lets the conversation fetch whatever it missed (`subscribed` event).
 * - Delivered receipts: when live messages from other people arrive, the highest `seq` received
 *   per community is sent back as `delivered`, batched over DELIVERED_BATCH_MS. At most one is in
 *   flight per community, and what waits is one number per community, so nothing queues up while
 *   offline; it goes out after the next connect. History and catch-up requests count as delivery
 *   on the server already.
 */
export function createSocketRealtime(options: SocketRealtimeOptions): RealtimeClient {
  const connect = options.connect ?? io;
  const appState = options.appState;

  let socket: Socket | null = null;
  let status: RealtimeStatus = 'idle';
  let foreground = true;
  let refreshNext = false;
  let handshakeFailures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let appStateSub: { remove(): void } | null = null;

  const listeners = new Map<string, Set<Listener>>();
  const notificationListeners = new Set<(event: { type: 'new' | 'read'; unreadCount: number }) => void>();
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  /** communityId -> default groupId learned from subscribe ack, so non-default group broadcasts do not leak into community chat. */
  const defaultGroupByCommunity = new Map<string, string>();
  /** channelId (`communityId` or `group:<id>`) -> username -> who is typing and when it lapses. */
  const typing = new Map<string, Map<string, { name: string; timer: ReturnType<typeof setTimeout> }>>();
  /** channelId -> highest `seq` received live and not yet sent as `delivered`. */
  const deliveredPending = new Map<string, number>();
  /** channelId -> highest `seq` the server has acknowledged as delivered. */
  const deliveredAcked = new Map<string, number>();
  const deliveredInFlight = new Set<string>();
  let deliveredTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by `reset` (sign-out), so answers to an earlier session's acknowledgements are ignored. */
  let session = 0;

  const setStatus = (next: RealtimeStatus) => {
    if (next === status) return;
    status = next;
    statusListeners.forEach((fn) => fn(next));
  };

  const emitTo = (channelId: string, event: ConversationEvent) => listeners.get(channelId)?.forEach((fn) => fn(event));

  const targetsFor = (communityId: string, groupId?: string): string[] => {
    const targets: string[] = [];
    if (groupId) {
      const gChannel = groupChannelId(groupId);
      if (listeners.has(gChannel)) targets.push(gChannel);
    }
    const defaultGroup = defaultGroupByCommunity.get(communityId);
    if (listeners.has(communityId) && (!groupId || !defaultGroup || defaultGroup === groupId)) {
      targets.push(communityId);
    }
    return targets;
  };

  const emitTyping = (communityId: string) =>
    emitTo(communityId, { type: 'typing', communityId, names: [...(typing.get(communityId)?.values() ?? [])].map((t) => t.name) });

  const stopTyping = (communityId: string, username?: string) => {
    const people = typing.get(communityId);
    if (!people) return;
    for (const [key, entry] of people) {
      if (username && key !== username) continue;
      clearTimeout(entry.timer);
      people.delete(key);
    }
    emitTyping(communityId);
  };

  const clearTimers = () => {
    if (retryTimer) clearTimeout(retryTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (deliveredTimer) clearTimeout(deliveredTimer);
    retryTimer = idleTimer = deliveredTimer = null;
  };

  const deliveredUpTo = (communityId: string) => Math.max(deliveredAcked.get(communityId) ?? 0, deliveredPending.get(communityId) ?? 0);

  function scheduleDelivered() {
    deliveredTimer ??= setTimeout(flushDelivered, DELIVERED_BATCH_MS);
  }

  /** Records that a live message reached the app; it is acknowledged with the next batch. */
  function noteDelivered(communityId: string, seq: number) {
    if (seq <= deliveredUpTo(communityId)) return;
    deliveredPending.set(communityId, seq);
    scheduleDelivered();
  }

  function forgetDelivered(communityId: string) {
    deliveredPending.delete(communityId);
    deliveredAcked.delete(communityId);
  }

  function flushDelivered() {
    deliveredTimer = null;
    const s = socket;
    // Offline: the pending positions wait (one per community) and go out on the next connect.
    if (!s?.connected) return;
    const current = session;
    for (const [channelId, seq] of deliveredPending) {
      if (deliveredInFlight.has(channelId)) continue;
      deliveredPending.delete(channelId);
      deliveredInFlight.add(channelId);
      (s.timeout(ACK_TIMEOUT_MS).emitWithAck('delivered', { ...channelTarget(channelId), seq }) as Promise<Ack<unknown>>)
        .then(
          (ack) => {
            if (current !== session) return;
            if (ack.ok) deliveredAcked.set(channelId, Math.max(seq, deliveredAcked.get(channelId) ?? 0));
            else if (ACCESS_ENDED.has(ack.error.code)) forgetDelivered(channelId);
            // Other refusals (validation) would only repeat; the next live message tries again.
          },
          () => {
            // No acknowledgement in time: send it again with the next batch or after reconnecting.
            if (current === session && seq > deliveredUpTo(channelId)) deliveredPending.set(channelId, seq);
          },
        )
        .finally(() => {
          if (current !== session) return;
          deliveredInFlight.delete(channelId);
          // Newer messages arrived while this one was in flight.
          if (deliveredPending.has(channelId) && socket?.connected) scheduleDelivered();
        });
    }
  }

  async function join(channelId: string) {
    const s = socket;
    if (!s?.connected) return;
    const target = channelTarget(channelId);
    try {
      const ack = (await s.timeout(ACK_TIMEOUT_MS).emitWithAck('subscribe', target)) as Ack<{
        communityId?: string;
        groupId?: string;
        lastSeq: number;
        receipts?: ApiReceipts | null;
      }>;
      if (!listeners.has(channelId)) {
        // Left while the subscription was in flight.
        s.emit('unsubscribe', target);
        return;
      }
      if (ack.ok && !isGroupChannel(channelId) && ack.data.groupId) {
        defaultGroupByCommunity.set(channelId, ack.data.groupId);
      }
      emitTo(
        channelId,
        ack.ok ? { type: 'subscribed', lastSeq: ack.data.lastSeq, receipts: toReceipts(ack.data.receipts) } : { type: 'error', code: ack.error.code },
      );
    } catch {
      // No acknowledgement in time; the next reconnect subscribes again.
    }
  }

  function open(): Socket {
    if (socket) {
      if (!socket.connected && !socket.active && foreground) {
        setStatus('connecting');
        socket.connect();
      }
      return socket;
    }
    const s = connect(`${options.url}/chat`, {
      path: options.path,
      transports: ['websocket'],
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      // A function, so every (re)connect sends the current token. Never in the query string.
      auth: (cb) => {
        const refresh = refreshNext;
        refreshNext = false;
        options.getAccessToken(refresh ? { refresh: true } : undefined).then(
          (token) => cb({ token: token ?? '' }),
          () => cb({ token: '' }),
        );
      },
    });

    s.on('connect', () => {
      handshakeFailures = 0;
      setStatus('connected');
      for (const id of listeners.keys()) void join(id);
      if (deliveredPending.size) scheduleDelivered();
    });
    s.on('disconnect', (reason) => {
      for (const id of typing.keys()) stopTyping(id);
      const wanted = foreground && listeners.size > 0;
      setStatus(wanted ? 'connecting' : 'idle');
      // A server-side disconnect (token expiry) is not retried automatically by Socket.IO.
      if (reason === 'io server disconnect' && wanted) {
        refreshNext = true;
        s.connect();
      }
    });
    s.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      // Transport problems are retried by Socket.IO itself.
      if (s.active) return setStatus('connecting');
      // Refused by the server's handshake checks: retry only what a new token or time can fix.
      const code = err.data?.code;
      const fixable = (code && TOKEN_PROBLEMS.has(code)) || code === 'AUTH_UNAVAILABLE';
      if (fixable && handshakeFailures < MAX_HANDSHAKE_RETRIES && listeners.size) {
        handshakeFailures += 1;
        refreshNext = code !== 'AUTH_UNAVAILABLE';
        setStatus('connecting');
        retryTimer = setTimeout(() => s.connect(), 1000 * 2 ** handshakeFailures);
        return;
      }
      setStatus('offline');
    });
    s.on('session:expired', () => {
      refreshNext = true;
    });
    s.on('message', ({ communityId, groupId, message }: { communityId: string; groupId?: string; message: ApiMessage }) => {
      const targets = targetsFor(communityId, groupId);
      for (const target of targets) {
        if (message.sender) stopTyping(target, message.sender.username);
        emitTo(target, { type: 'message', message: toMessage(message) });
        // The sender's own positions advance when they send; only others' messages need acknowledging.
        if (!message.isMine && Number.isInteger(message.seq)) noteDelivered(target, message.seq);
      }
    });
    s.on('message:deleted', ({ communityId, groupId, messageId }: { communityId: string; groupId?: string; messageId: string }) => {
      for (const target of targetsFor(communityId, groupId)) {
        emitTo(target, { type: 'deleted', messageId });
      }
    });
    s.on('typing', ({ communityId, groupId, user }: { communityId: string; groupId?: string; user: { username: string | null; displayName: string | null } }) => {
      if (!user.username) return;
      for (const target of targetsFor(communityId, groupId)) {
        const people = typing.get(target) ?? new Map();
        typing.set(target, people);
        const previous = people.get(user.username);
        if (previous) clearTimeout(previous.timer);
        const name = (user.displayName ?? user.username).split(' ')[0];
        people.set(user.username, { name, timer: setTimeout(() => stopTyping(target, user.username!), TYPING_TTL_MS) });
        emitTyping(target);
      }
    });
    s.on('read', ({ communityId, groupId, lastReadSeq }: { communityId: string; groupId?: string; lastReadSeq: number }) => {
      for (const target of targetsFor(communityId, groupId)) {
        emitTo(target, { type: 'read', communityId: target, lastReadSeq });
      }
    });
    s.on('receipts', ({ communityId, groupId, ...raw }: { communityId: string; groupId?: string } & ApiReceipts) => {
      const receipts = toReceipts(raw);
      if (!receipts) return;
      for (const target of targetsFor(communityId, groupId)) {
        emitTo(target, { type: 'receipts', receipts });
      }
    });
    s.on('subscription:ended', ({ communityId, groupId }: { communityId: string; groupId?: string }) => {
      for (const target of targetsFor(communityId, groupId)) {
        forgetDelivered(target);
        emitTo(target, { type: 'ended' });
      }
    });
    s.on('notification:new', (data: { unreadCount: number }) => {
      notificationListeners.forEach((fn) => fn({ type: 'new', unreadCount: data.unreadCount }));
    });
    s.on('notification:read', (data: { unreadCount: number }) => {
      notificationListeners.forEach((fn) => fn({ type: 'read', unreadCount: data.unreadCount }));
    });

    appStateSub = appState?.addEventListener('change', (state) => {
      const isForeground = state === 'active';
      if (isForeground === foreground) return;
      foreground = isForeground;
      if (!foreground) {
        clearTimers();
        s.disconnect();
        setStatus('idle');
      } else if (listeners.size || notificationListeners.size) {
        setStatus('connecting');
        s.connect();
      }
    }) ?? null;

    socket = s;
    setStatus('connecting');
    s.connect();
    return s;
  }

  function close() {
    clearTimers();
    appStateSub?.remove();
    appStateSub = null;
    for (const id of typing.keys()) stopTyping(id);
    typing.clear();
    notificationListeners.clear();
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    handshakeFailures = 0;
    setStatus('idle');
  }

  return {
    live: true,
    subscribe(communityId, onEvent) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      const set = listeners.get(communityId) ?? new Set<Listener>();
      set.add(onEvent);
      listeners.set(communityId, set);
      const s = open();
      // Subscribing again is harmless on the server, and its `lastSeq` lets a newly opened
      // conversation catch up even when the inbox already holds the subscription.
      if (s.connected) void join(communityId);

      return () => {
        set.delete(onEvent);
        if (set.size) return;
        listeners.delete(communityId);
        stopTyping(communityId);
        typing.delete(communityId);
        if (socket?.connected) socket.emit('unsubscribe', channelTarget(communityId));
        if (!listeners.size && !notificationListeners.size) idleTimer = setTimeout(close, IDLE_DISCONNECT_MS);
      };
    },
    subscribeNotifications(onNotification) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
      notificationListeners.add(onNotification);
      open();
      return () => {
        notificationListeners.delete(onNotification);
        if (!listeners.size && !notificationListeners.size) idleTimer = setTimeout(close, IDLE_DISCONNECT_MS);
      };
    },
    sendTyping(communityId) {
      if (socket?.connected && listeners.has(communityId)) socket.emit('typing', channelTarget(communityId), () => {});
    },
    status: () => status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    reset() {
      session += 1;
      listeners.clear();
      defaultGroupByCommunity.clear();
      deliveredPending.clear();
      deliveredAcked.clear();
      deliveredInFlight.clear();
      close();
    },
  };
}
