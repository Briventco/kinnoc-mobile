import type { Socket } from 'socket.io-client';

import type { ConversationEvent, RealtimeClient } from '../../realtime';
import { apiMessage } from '../__fixtures__/payloads';
import { createSocketRealtime } from '../socket';

type Handler = (...args: any[]) => void;

/** Enough of a Socket.IO client socket to drive the realtime client from tests. */
class FakeSocket {
  handlers = new Map<string, Handler[]>();
  emitted: { event: string; payload: unknown }[] = [];
  connected = false;
  active = false;
  connectCalls = 0;
  /** What the server answers to `subscribe`. */
  subscribeAck: (communityId: string) => unknown = () => ({ ok: true, data: { lastSeq: 42 } });
  /** What the server answers to `delivered`; a promise lets a test hold the answer back. */
  deliveredAck: (payload: { communityId: string; seq: number }) => unknown = ({ communityId }) => ({ ok: true, data: { communityId } });

  constructor(public options: { auth: (cb: (data: object) => void) => void }) {}

  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  /** Simulates the server sending an event. */
  receive(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((fn) => fn(...args));
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }
  timeout() {
    return this;
  }
  async emitWithAck(event: string, payload: { communityId: string; seq?: number }) {
    this.emitted.push({ event, payload });
    if (event === 'delivered') return this.deliveredAck(payload as { communityId: string; seq: number });
    return this.subscribeAck(payload.communityId);
  }
  /** `delivered` acknowledgements sent so far. */
  delivered() {
    return this.emitted.filter((e) => e.event === 'delivered').map((e) => e.payload);
  }
  connect() {
    this.connectCalls += 1;
    this.active = true;
    return this;
  }
  disconnect() {
    const was = this.connected;
    this.connected = false;
    this.active = false;
    if (was) this.receive('disconnect', 'io client disconnect');
    return this;
  }
  /** Completes the handshake: reads the auth payload, then connects. */
  async open() {
    const auth = await new Promise<object>((resolve) => this.options.auth(resolve));
    this.connected = true;
    this.receive('connect');
    return auth;
  }
}

const COMMUNITY = '0b0f4f5e-6d43-4a39-9f0e-1f8b9d6a0c11';
const flush = () => new Promise<void>((r) => setImmediate(() => r()));
/** Every client a test creates, closed afterwards so no timer outlives its test. */
const created: RealtimeClient[] = [];

function setup() {
  const sockets: FakeSocket[] = [];
  const appListeners: ((s: string) => void)[] = [];
  const getAccessToken = jest.fn(async (options?: { refresh?: boolean }) => (options?.refresh ? 'fresh-token' : 'token'));
  const realtime = createSocketRealtime({
    url: 'https://api.test',
    path: '/api/v1/socket.io',
    getAccessToken,
    connect: (uri, options) => {
      expect(uri).toBe('https://api.test/chat');
      expect(options.path).toBe('/api/v1/socket.io');
      expect(options.transports).toEqual(['websocket']);
      const s = new FakeSocket(options as never);
      sockets.push(s);
      return s as unknown as Socket;
    },
    appState: {
      addEventListener: (_type, fn) => {
        appListeners.push(fn);
        return { remove: () => appListeners.splice(appListeners.indexOf(fn), 1) };
      },
    },
  });
  created.push(realtime);
  const events: ConversationEvent[] = [];
  return { realtime, sockets, events, getAccessToken, appListeners, listen: (e: ConversationEvent) => events.push(e) };
}

afterEach(() => {
  created.splice(0).forEach((r) => r.reset());
  jest.useRealTimers();
});

describe('createSocketRealtime', () => {
  it('connects on first subscribe with the token in the auth payload, then subscribes', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    expect(sockets).toHaveLength(1);
    expect(realtime.status()).toBe('connecting');

    await expect(sockets[0].open()).resolves.toEqual({ token: 'token' });
    await flush();
    expect(realtime.status()).toBe('connected');
    expect(sockets[0].emitted).toContainEqual({ event: 'subscribe', payload: { communityId: COMMUNITY } });
    expect(events).toContainEqual({ type: 'subscribed', lastSeq: 42, receipts: null });
  });

  it('passes on the receipts in the subscribe acknowledgement', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    sockets[0].subscribeAck = (communityId) => ({ ok: true, data: { communityId, lastSeq: 42, receipts: { deliveredSeq: 41, readSeq: 40 } } });
    await sockets[0].open();
    await flush();
    expect(events).toContainEqual({ type: 'subscribed', lastSeq: 42, receipts: { deliveredSeq: 41, readSeq: 40 } });
  });

  it('gives a second listener of the same community its own catch-up point', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, () => {});
    await sockets[0].open();
    await flush();
    sockets[0].subscribeAck = () => ({ ok: true, data: { lastSeq: 60 } });
    realtime.subscribe(COMMUNITY, listen);
    await flush();
    expect(events).toContainEqual({ type: 'subscribed', lastSeq: 60, receipts: null });
  });

  it('maps server events for the subscribed community only', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    sockets[0].receive('message', { communityId: COMMUNITY, message: apiMessage({ seq: 43 }) });
    sockets[0].receive('message', { communityId: 'another', message: apiMessage({ seq: 1 }) });
    sockets[0].receive('message:deleted', { communityId: COMMUNITY, messageId: 'm1' });
    sockets[0].receive('read', { communityId: COMMUNITY, lastReadSeq: 43 });
    sockets[0].receive('receipts', { communityId: COMMUNITY, deliveredSeq: 43, readSeq: 41 });
    sockets[0].receive('receipts', { communityId: 'another', deliveredSeq: 1, readSeq: 1 });
    // Malformed receipts are ignored rather than shown.
    sockets[0].receive('receipts', { communityId: COMMUNITY, deliveredSeq: null, readSeq: 41 });
    sockets[0].receive('subscription:ended', { communityId: COMMUNITY, reason: 'membership-ended' });
    expect(events.filter((e) => e.type !== 'subscribed')).toEqual([
      { type: 'message', message: expect.objectContaining({ seq: 43, status: 'sent' }) },
      { type: 'deleted', messageId: 'm1' },
      { type: 'read', communityId: COMMUNITY, lastReadSeq: 43 },
      { type: 'receipts', receipts: { deliveredSeq: 43, readSeq: 41 } },
      { type: 'ended' },
    ]);
  });

  it('reports a refused subscription', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    sockets[0].subscribeAck = () => ({ ok: false, error: { code: 'MEMBERSHIP_REQUIRED', message: 'x' } });
    await sockets[0].open();
    await flush();
    expect(events).toContainEqual({ type: 'error', code: 'MEMBERSHIP_REQUIRED' });
  });

  it('subscribes again after a reconnect so the conversation can catch up', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    await flush();
    sockets[0].connected = false;
    sockets[0].receive('disconnect', 'transport close');
    expect(realtime.status()).toBe('connecting');
    sockets[0].subscribeAck = () => ({ ok: true, data: { lastSeq: 50 } });
    await sockets[0].open();
    await flush();
    expect(events.filter((e) => e.type === 'subscribed')).toEqual([
      { type: 'subscribed', lastSeq: 42, receipts: null },
      { type: 'subscribed', lastSeq: 50, receipts: null },
    ]);
  });

  it('reconnects with a refreshed token after the server ends an expired session', async () => {
    const { realtime, sockets, listen, getAccessToken } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    sockets[0].receive('session:expired', { code: 'AUTH_TOKEN_EXPIRED' });
    sockets[0].connected = false;
    const before = sockets[0].connectCalls;
    sockets[0].receive('disconnect', 'io server disconnect');
    expect(sockets[0].connectCalls).toBe(before + 1);
    await expect(sockets[0].open()).resolves.toEqual({ token: 'fresh-token' });
    expect(getAccessToken).toHaveBeenLastCalledWith({ refresh: true });
  });

  it('retries a handshake refused for an expired token, with a fresh token', async () => {
    jest.useFakeTimers();
    const { realtime, sockets, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    const s = sockets[0];
    s.active = false;
    s.receive('connect_error', Object.assign(new Error('expired'), { data: { code: 'AUTH_TOKEN_EXPIRED' } }));
    expect(realtime.status()).toBe('connecting');
    const before = s.connectCalls;
    jest.advanceTimersByTime(2000);
    expect(s.connectCalls).toBe(before + 1);
  });

  it('gives up on handshake refusals a new token cannot fix', () => {
    const { realtime, sockets, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    sockets[0].active = false;
    sockets[0].receive('connect_error', Object.assign(new Error('suspended'), { data: { code: 'ACCOUNT_SUSPENDED' } }));
    expect(realtime.status()).toBe('offline');
  });

  it('tracks who is typing and lets it lapse', async () => {
    jest.useFakeTimers();
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    sockets[0].connected = true;
    sockets[0].receive('typing', { communityId: COMMUNITY, user: { username: 'ada', displayName: 'Ada Lovelace' } });
    expect(events.at(-1)).toEqual({ type: 'typing', communityId: COMMUNITY, names: ['Ada'] });
    jest.advanceTimersByTime(5000);
    expect(events.at(-1)).toEqual({ type: 'typing', communityId: COMMUNITY, names: [] });
  });

  it('clears a typing indicator when that person’s message arrives', () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    sockets[0].receive('typing', { communityId: COMMUNITY, user: { username: 'ada', displayName: 'Ada' } });
    sockets[0].receive('message', { communityId: COMMUNITY, message: apiMessage() });
    expect(events.filter((e) => e.type === 'typing').at(-1)).toEqual({ type: 'typing', communityId: COMMUNITY, names: [] });
  });

  it('sends typing only while subscribed and connected', async () => {
    const { realtime, sockets, listen } = setup();
    const unsubscribe = realtime.subscribe(COMMUNITY, listen);
    realtime.sendTyping(COMMUNITY);
    expect(sockets[0].emitted.some((e) => e.event === 'typing')).toBe(false);
    await sockets[0].open();
    realtime.sendTyping(COMMUNITY);
    expect(sockets[0].emitted).toContainEqual({ event: 'typing', payload: { communityId: COMMUNITY } });
    unsubscribe();
    realtime.sendTyping(COMMUNITY);
    expect(sockets[0].emitted.filter((e) => e.event === 'typing')).toHaveLength(1);
  });

  it('unsubscribes, then closes the connection after it has been idle', async () => {
    jest.useFakeTimers();
    const { realtime, sockets, listen } = setup();
    const unsubscribe = realtime.subscribe(COMMUNITY, listen);
    sockets[0].connected = true;
    unsubscribe();
    expect(sockets[0].emitted).toContainEqual({ event: 'unsubscribe', payload: { communityId: COMMUNITY } });
    expect(sockets[0].connected).toBe(true);
    jest.advanceTimersByTime(30_000);
    expect(sockets[0].connected).toBe(false);
    expect(realtime.status()).toBe('idle');
  });

  it('disconnects in the background and reconnects in the foreground', async () => {
    const { realtime, sockets, listen, appListeners } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    appListeners.forEach((fn) => fn('background'));
    expect(sockets[0].connected).toBe(false);
    expect(realtime.status()).toBe('idle');
    const before = sockets[0].connectCalls;
    appListeners.forEach((fn) => fn('active'));
    expect(sockets[0].connectCalls).toBe(before + 1);
  });

  it('forgets everything on reset (sign-out)', async () => {
    const { realtime, sockets, events, listen, appListeners } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    realtime.reset();
    expect(sockets[0].connected).toBe(false);
    expect(appListeners).toHaveLength(0);
    sockets[0].receive('message', { communityId: COMMUNITY, message: apiMessage() });
    expect(events.some((e) => e.type === 'message')).toBe(false);
    // The next subscription starts a new connection.
    realtime.subscribe(COMMUNITY, listen);
    expect(sockets).toHaveLength(2);
  });

  describe('delivered receipts', () => {
    const live = (s: FakeSocket, seq: number, over: Record<string, unknown> = {}) =>
      s.receive('message', { communityId: COMMUNITY, message: apiMessage({ id: `m${seq}`, seq, ...over }) });

    it('acknowledges live messages from others once per batch, with the highest seq received', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      live(sockets[0], 43);
      live(sockets[0], 45);
      live(sockets[0], 44);
      expect(sockets[0].delivered()).toEqual([]);
      jest.advanceTimersByTime(500);
      expect(sockets[0].delivered()).toEqual([{ communityId: COMMUNITY, seq: 45 }]);
    });

    it('does not acknowledge the viewer’s own messages', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      live(sockets[0], 43, { isMine: true });
      jest.advanceTimersByTime(1000);
      expect(sockets[0].delivered()).toEqual([]);
    });

    it('ignores duplicate and older deliveries once acknowledged', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      live(sockets[0], 43);
      jest.advanceTimersByTime(500);
      await flush();
      live(sockets[0], 43);
      live(sockets[0], 40);
      jest.advanceTimersByTime(500);
      await flush();
      expect(sockets[0].delivered()).toEqual([{ communityId: COMMUNITY, seq: 43 }]);
    });

    it('keeps one acknowledgement in flight per community and sends what arrived meanwhile after it', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      let answer: (v: unknown) => void = () => {};
      sockets[0].deliveredAck = () => new Promise((resolve) => (answer = resolve));
      live(sockets[0], 43);
      jest.advanceTimersByTime(500);
      live(sockets[0], 44);
      jest.advanceTimersByTime(500);
      expect(sockets[0].delivered()).toEqual([{ communityId: COMMUNITY, seq: 43 }]);
      sockets[0].deliveredAck = ({ communityId }) => ({ ok: true, data: { communityId } });
      answer({ ok: true, data: { communityId: COMMUNITY } });
      await flush();
      jest.advanceTimersByTime(500);
      expect(sockets[0].delivered()).toEqual([
        { communityId: COMMUNITY, seq: 43 },
        { communityId: COMMUNITY, seq: 44 },
      ]);
    });

    it('holds the position while offline and sends it after reconnecting', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      live(sockets[0], 43);
      sockets[0].connected = false;
      sockets[0].receive('disconnect', 'transport close');
      jest.advanceTimersByTime(1000);
      expect(sockets[0].delivered()).toEqual([]);
      await sockets[0].open();
      await flush();
      jest.advanceTimersByTime(500);
      expect(sockets[0].delivered()).toEqual([{ communityId: COMMUNITY, seq: 43 }]);
    });

    it('sends again after a timed-out acknowledgement, but not after the membership ended', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      sockets[0].deliveredAck = () => Promise.reject(new Error('operation has timed out'));
      live(sockets[0], 43);
      jest.advanceTimersByTime(500);
      await flush();
      sockets[0].deliveredAck = ({ communityId }) => ({ ok: true, data: { communityId } });
      live(sockets[0], 43); // a repeat of the same message triggers the retry
      jest.advanceTimersByTime(500);
      await flush();
      expect(sockets[0].delivered()).toEqual([
        { communityId: COMMUNITY, seq: 43 },
        { communityId: COMMUNITY, seq: 43 },
      ]);

      sockets[0].deliveredAck = () => ({ ok: false, error: { code: 'MEMBERSHIP_REQUIRED', message: 'x' } });
      live(sockets[0], 44);
      jest.advanceTimersByTime(500);
      await flush();
      jest.advanceTimersByTime(5000);
      expect(sockets[0].delivered()).toHaveLength(3);
    });

    it('drops pending acknowledgements on sign-out', async () => {
      jest.useFakeTimers({ advanceTimers: true });
      const { realtime, sockets, listen } = setup();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[0].open();
      live(sockets[0], 43);
      realtime.reset();
      realtime.subscribe(COMMUNITY, listen);
      await sockets[1].open();
      await flush();
      jest.advanceTimersByTime(1000);
      expect(sockets[0].delivered()).toEqual([]);
      expect(sockets[1].delivered()).toEqual([]);
    });
  });
});
