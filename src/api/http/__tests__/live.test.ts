/**
 * Live integration test: the app's real HTTP adapter and Socket.IO client against a running
 * Kinnoc API and its Supabase project. Skipped unless KINNOC_LIVE=1. Run it only against the
 * development project, with a test account:
 *
 *   EXPO_PUBLIC_API_URL=https://kinnoc-api.onrender.com/api/v1 \
 *   EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… \
 *   KINNOC_TEST_EMAIL=… KINNOC_TEST_PASSWORD=… \
 *   npm run test:live
 *
 * Writes test data: it reuses one PRIVATE, invite-only community named below (created on the
 * first run; the API cannot delete communities yet) and sends messages there, deleting them
 * again. Nothing secret is printed.
 */
import { createClient } from '@supabase/supabase-js';

import type { ConversationEvent } from '../../realtime';
import type { Message } from '../../types';
import { createHttpApi } from '..';
import { createHttpClient } from '../client';
import { createSocketRealtime } from '../socket';

const env = (name: string) => process.env[name]?.trim() || undefined;
const API_URL = env('EXPO_PUBLIC_API_URL');
const SUPABASE_URL = env('EXPO_PUBLIC_SUPABASE_URL');
const ANON_KEY = env('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const EMAIL = env('KINNOC_TEST_EMAIL');
const PASSWORD = env('KINNOC_TEST_PASSWORD');
const enabled = env('KINNOC_LIVE') === '1' && !!(API_URL && SUPABASE_URL && ANON_KEY && EMAIL && PASSWORD);

/** A private, invite-only community kept for this test, invisible in discovery. */
const TEST_COMMUNITY = 'Kinnoc mobile integration test';

const live = enabled ? describe : describe.skip;
jest.setTimeout(180_000);

function waitFor<T extends ConversationEvent>(events: ConversationEvent[], match: (e: ConversationEvent) => e is T, ms = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const found = events.find(match);
      if (found) return resolve(found);
      if (Date.now() - started > ms) return reject(new Error('Timed out waiting for a realtime event'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

live('Kinnoc API (live)', () => {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const getAccessToken = async (options?: { refresh?: boolean }) => {
    if (options?.refresh) await supabase.auth.refreshSession();
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  };
  const onUnauthorized = jest.fn();
  const api = createHttpApi(createHttpClient({ baseUrl: API_URL!, getAccessToken, onUnauthorized, timeoutMs: 90_000 }), {
    uploadCommunityImage: () => Promise.reject(new Error('not used')),
  });
  const match = API_URL!.match(/^(https?:\/\/[^/]+)(\/.*)?$/)!;
  const realtime = createSocketRealtime({
    url: match[1],
    path: `${match[2] ?? ''}/socket.io`,
    getAccessToken,
    appState: { addEventListener: () => ({ remove: () => {} }) },
  });
  let communityId = '';

  beforeAll(async () => {
    // Wakes a sleeping Render instance before the timed steps.
    await fetch(API_URL!.replace(/\/api\/v\d+$/, '/')).catch(() => undefined);
    const { error } = await supabase.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
    if (error) throw new Error(`Test sign-in failed: ${error.message}`);
  });

  afterAll(async () => {
    realtime.reset();
    await supabase.auth.signOut();
  });

  it('provisions the account, which has a profile', async () => {
    const account = await api.account.load();
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(account.profile?.username).toBeTruthy();
    const me = await api.profile.me();
    expect(me.isMe).toBe(true);
  });

  it('lists categories and discovers only public communities', async () => {
    const categories = await api.communities.categories();
    expect(categories.length).toBeGreaterThan(0);
    const page = await api.communities.browse({ query: '', category: null }, null);
    expect(page.items.every((c) => c.visibility === 'public')).toBe(true);
    const search = await api.communities.browse({ query: 'zzzz-no-such-community', category: categories[0].slug }, null);
    expect(search.items).toEqual([]);
  });

  it('finds or creates the private test community, owned by the test user', async () => {
    const mine = await api.communities.mine('member', null);
    let community = mine.items.find((c) => c.name === TEST_COMMUNITY);
    if (!community) {
      const [category] = await api.communities.categories();
      community = await api.communities.create({
        name: TEST_COMMUNITY,
        description: 'Used by the mobile app’s automated integration test. Safe to ignore.',
        category: category.slug,
        visibility: 'private',
        joinPolicy: 'invite-only',
      });
    }
    communityId = community.id;
    expect(community).toMatchObject({ visibility: 'private', joinPolicy: 'invite-only', membership: 'member', role: 'owner' });
    // Owners cannot leave; the API says so with a stable code.
    await expect(api.communities.leave(communityId)).rejects.toMatchObject({ serverCode: 'OWNER_CANNOT_LEAVE' });
    // Private communities never appear in discovery.
    const found = await api.communities.browse({ query: TEST_COMMUNITY, category: null }, null);
    expect(found.items.some((c) => c.id === communityId)).toBe(false);
  });

  it('sends, receives live, catches up, replies and deletes', async () => {
    const events: ConversationEvent[] = [];
    const unsubscribe = realtime.subscribe(communityId, (e) => events.push(e));
    const subscribed = await waitFor(events, (e): e is Extract<ConversationEvent, { type: 'subscribed' }> => e.type === 'subscribed');

    const clientId = crypto.randomUUID();
    const sent = await api.messages.send({ communityId, clientId, text: `Integration test ${new Date().toISOString()}`, replyToId: null, attachmentUris: [] });
    expect(sent).toMatchObject({ clientId, isMine: true, status: 'sent' });
    expect(sent.seq).toBeGreaterThan(subscribed.lastSeq);

    // Delivered live to the sender's own connection too.
    const live = await waitFor(events, (e): e is Extract<ConversationEvent, { type: 'message' }> => e.type === 'message' && e.message.id === sent.id);
    expect(live.message.clientId).toBe(clientId);

    // Retrying with the same client ID returns the original instead of a duplicate.
    const retried = await api.messages.send({ communityId, clientId, text: 'ignored', replyToId: null, attachmentUris: [] });
    expect(retried.id).toBe(sent.id);

    // Catch-up after the position before this message returns it, oldest first.
    const since = await api.messages.since(communityId, sent.seq! - 1, null);
    expect(since.items[0].id).toBe(sent.id);

    const reply: Message = await api.messages.send({ communityId, clientId: crypto.randomUUID(), text: 'Reply from the test', replyToId: sent.id, attachmentUris: [] });
    expect(reply.replyTo).toMatchObject({ id: sent.id });

    await api.messages.remove(communityId, reply.id);
    await api.messages.remove(communityId, sent.id);
    await waitFor(events, (e): e is Extract<ConversationEvent, { type: 'deleted' }> => e.type === 'deleted' && e.messageId === sent.id);

    const history = await api.messages.list(communityId, null);
    expect(history.items.find((m) => m.id === sent.id)).toMatchObject({ text: '', deletedAt: expect.any(String) });

    await api.communities.markRead(communityId, null);
    const inbox = await api.communities.inbox();
    expect(inbox.find((e) => e.community.id === communityId)?.unreadCount).toBe(0);

    unsubscribe();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('refuses invalid input with field errors', async () => {
    await expect(api.communities.create({ name: 'x', description: '', category: 'design', visibility: 'public', joinPolicy: 'open' })).rejects.toMatchObject({
      code: 'validation',
      serverCode: 'VALIDATION_FAILED',
    });
    await expect(api.communities.get('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ serverCode: 'COMMUNITY_NOT_FOUND' });
    // Private communities can only grow by invitation; the form never offers this combination.
    await expect(api.communities.create({ name: 'Never created', description: 'x', category: 'design', visibility: 'private', joinPolicy: 'open' })).rejects.toMatchObject({
      serverCode: 'INVALID_COMMUNITY_SETTINGS',
    });
  });
});
