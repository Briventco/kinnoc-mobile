import type { Socket } from 'socket.io-client';

import type { ConversationEvent } from '../../realtime';
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
  async emitWithAck(event: string, payload: { communityId: string }) {
    this.emitted.push({ event, payload });
    return this.subscribeAck(payload.communityId);
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
  const events: ConversationEvent[] = [];
  return { realtime, sockets, events, getAccessToken, appListeners, listen: (e: ConversationEvent) => events.push(e) };
}

afterEach(() => jest.useRealTimers());

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
    expect(events).toContainEqual({ type: 'subscribed', lastSeq: 42 });
  });

  it('gives a second listener of the same community its own catch-up point', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, () => {});
    await sockets[0].open();
    await flush();
    sockets[0].subscribeAck = () => ({ ok: true, data: { lastSeq: 60 } });
    realtime.subscribe(COMMUNITY, listen);
    await flush();
    expect(events).toContainEqual({ type: 'subscribed', lastSeq: 60 });
  });

  it('maps server events for the subscribed community only', async () => {
    const { realtime, sockets, events, listen } = setup();
    realtime.subscribe(COMMUNITY, listen);
    await sockets[0].open();
    sockets[0].receive('message', { communityId: COMMUNITY, message: apiMessage({ seq: 43 }) });
    sockets[0].receive('message', { communityId: 'another', message: apiMessage({ seq: 1 }) });
    sockets[0].receive('message:deleted', { communityId: COMMUNITY, messageId: 'm1' });
    sockets[0].receive('read', { communityId: COMMUNITY, lastReadSeq: 43 });
    sockets[0].receive('subscription:ended', { communityId: COMMUNITY, reason: 'membership-ended' });
    expect(events.filter((e) => e.type !== 'subscribed')).toEqual([
      { type: 'message', message: expect.objectContaining({ seq: 43, status: 'sent' }) },
      { type: 'deleted', messageId: 'm1' },
      { type: 'read', communityId: COMMUNITY, lastReadSeq: 43 },
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
      { type: 'subscribed', lastSeq: 42 },
      { type: 'subscribed', lastSeq: 50 },
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
});
