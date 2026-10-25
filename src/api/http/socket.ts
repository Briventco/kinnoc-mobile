import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

import type { ConversationEvent, RealtimeClient, RealtimeStatus } from '../realtime';
import { type ApiMessage, toMessage } from './mappers';

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
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  /** communityId → username → who is typing and when it lapses. */
  const typing = new Map<string, Map<string, { name: string; timer: ReturnType<typeof setTimeout> }>>();

  const setStatus = (next: RealtimeStatus) => {
    if (next === status) return;
    status = next;
    statusListeners.forEach((fn) => fn(next));
  };

  const emitTo = (communityId: string, event: ConversationEvent) => listeners.get(communityId)?.forEach((fn) => fn(event));

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
    retryTimer = idleTimer = null;
  };

  async function join(communityId: string) {
    const s = socket;
    if (!s?.connected) return;
    try {
      const ack = (await s.timeout(ACK_TIMEOUT_MS).emitWithAck('subscribe', { communityId })) as Ack<{ lastSeq: number }>;
      if (!listeners.has(communityId)) {
        // Left while the subscription was in flight.
        s.emit('unsubscribe', { communityId });
        return;
      }
      emitTo(communityId, ack.ok ? { type: 'subscribed', lastSeq: ack.data.lastSeq } : { type: 'error', code: ack.error.code });
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
    s.on('message', ({ communityId, message }: { communityId: string; message: ApiMessage }) => {
      if (message.sender) stopTyping(communityId, message.sender.username);
      emitTo(communityId, { type: 'message', message: toMessage(message) });
    });
    s.on('message:deleted', ({ communityId, messageId }: { communityId: string; messageId: string }) =>
      emitTo(communityId, { type: 'deleted', messageId }),
    );
    s.on('typing', ({ communityId, user }: { communityId: string; user: { username: string | null; displayName: string | null } }) => {
      if (!listeners.has(communityId) || !user.username) return;
      const people = typing.get(communityId) ?? new Map();
      typing.set(communityId, people);
      const previous = people.get(user.username);
      if (previous) clearTimeout(previous.timer);
      const name = (user.displayName ?? user.username).split(' ')[0];
      people.set(user.username, { name, timer: setTimeout(() => stopTyping(communityId, user.username!), TYPING_TTL_MS) });
      emitTyping(communityId);
    });
    s.on('read', ({ communityId, lastReadSeq }: { communityId: string; lastReadSeq: number }) =>
      emitTo(communityId, { type: 'read', communityId, lastReadSeq }),
    );
    s.on('subscription:ended', ({ communityId }: { communityId: string }) => emitTo(communityId, { type: 'ended' }));

    appStateSub = appState?.addEventListener('change', (state) => {
      const isForeground = state === 'active';
      if (isForeground === foreground) return;
      foreground = isForeground;
      if (!foreground) {
        clearTimers();
        s.disconnect();
        setStatus('idle');
      } else if (listeners.size) {
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
        if (socket?.connected) socket.emit('unsubscribe', { communityId });
        if (!listeners.size) idleTimer = setTimeout(close, IDLE_DISCONNECT_MS);
      };
    },
    sendTyping(communityId) {
      if (socket?.connected && listeners.has(communityId)) socket.emit('typing', { communityId }, () => {});
    },
    status: () => status,
    onStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    reset() {
      listeners.clear();
      close();
    },
  };
}
