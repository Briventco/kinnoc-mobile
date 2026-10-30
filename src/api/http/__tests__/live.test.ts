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
 * first run; the API cannot delete communities yet) and sends messages and a post there, deleting
 * them again (an uploaded test image stays in the uploader's own storage folder if storage refuses
 * its removal). Nothing secret is printed.
 */
import { createClient } from '@supabase/supabase-js';

import { isApiError } from '../../errors';

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

/** Events are public: this part reads only, and needs no test account. */
(env('KINNOC_LIVE') === '1' && API_URL ? describe : describe.skip)('Kinnoc events API (live, public)', () => {
  const api = createHttpApi(createHttpClient({ baseUrl: API_URL!, getAccessToken: async () => null, onUnauthorized: () => {}, timeoutMs: 90_000 }), {
    uploadCommunityImage: () => Promise.reject(new Error('not used')),
    uploadPostImage: () => Promise.reject(new Error('not used')),
    uploadAvatar: () => Promise.reject(new Error('not used')),
    removeAvatarFile: () => Promise.reject(new Error('not used')),
  });

  beforeAll(async () => {
    await fetch(API_URL!.replace(/\/api\/v\d+$/, '/')).catch(() => undefined);
  });

  it('lists upcoming published events, each one reachable by ID and by slug', async () => {
    const page = await api.discover.list('events', '', null);
    expect(page.nextCursor === null || typeof page.nextCursor === 'string').toBe(true);
    for (const event of page.items) {
      expect(event).toMatchObject({ kind: 'event', status: 'scheduled', isPast: false });
      if (event.kind === 'event') expect(Number.isNaN(Date.parse(event.startsAt))).toBe(false);
    }
    const home = await api.discover.home();
    // Home shows the soonest events, so each is on the list's first page too.
    const listed = new Set(page.items.map((e) => e.id));
    expect([...home.thisWeek, ...home.upcomingEvents].every((e) => listed.has(e.id))).toBe(true);
    const first = page.items[0];
    if (!first) return console.warn('No published upcoming events on this API; detail check skipped.');
    expect(await api.discover.get(first.id)).toMatchObject({ id: first.id, title: first.title });
  });

  it('pages without repeating events', async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const page = await api.discover.list('events', '', cursor);
      for (const e of page.items) {
        expect(seen.has(e.id)).toBe(false);
        seen.add(e.id);
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
  });

  it('reads the public verification badge, and an unknown username as unverified', async () => {
    expect(await api.verification.profile('no-such-user-kinnoc-test')).toEqual({ isVerified: false, category: null, organisation: null, position: null, verifiedAt: null });
    // Optionally a known verified username, to see a real badge come through.
    const verified = env('KINNOC_VERIFIED_USERNAME');
    if (verified) expect(await api.verification.profile(verified)).toMatchObject({ isVerified: true, category: expect.any(String) });
  });

  it('searches, and reports an unknown event as not found', async () => {
    expect(Array.isArray((await api.discover.list('events', 'zzzz-no-such-event', null)).items)).toBe(true);
    const error = await api.discover.get('no-such-event-slug').catch((e: unknown) => e);
    expect(isApiError(error, 'EVENT_NOT_FOUND')).toBe(true);
  });
});

live('Kinnoc API (live)', () => {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const getAccessToken = async (options?: { refresh?: boolean }) => {
    if (options?.refresh) await supabase.auth.refreshSession();
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  };
  const onUnauthorized = jest.fn();
  const api = createHttpApi(createHttpClient({ baseUrl: API_URL!, getAccessToken, onUnauthorized, timeoutMs: 90_000 }), {
    uploadCommunityImage: () => Promise.reject(new Error('not used')),
    uploadPostImage: () => Promise.reject(new Error('not used')),
    uploadAvatar: () => Promise.reject(new Error('not used')),
    removeAvatarFile: () => Promise.reject(new Error('not used')),
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

  it('returns Delivered and Seen receipts with history and on subscribe', async () => {
    const history = await api.messages.list(communityId, null);
    // The test community has one member, so both positions are 0 by the API's rule.
    expect(history.receipts).toEqual({ deliveredSeq: expect.any(Number), readSeq: expect.any(Number) });
    const events: ConversationEvent[] = [];
    const unsubscribe = realtime.subscribe(communityId, (e) => events.push(e));
    const subscribed = await waitFor(events, (e): e is Extract<ConversationEvent, { type: 'subscribed' }> => e.type === 'subscribed');
    expect(subscribed.receipts).toEqual({ deliveredSeq: expect.any(Number), readSeq: expect.any(Number) });
    unsubscribe();
    const inbox = await api.communities.inbox();
    expect(inbox.find((e) => e.community.id === communityId)?.receipts).toEqual({ deliveredSeq: expect.any(Number), readSeq: expect.any(Number) });
  });

  it('loads both feeds and posts, edits, likes, comments on and deletes a community post', async () => {
    const publicFeed = await api.feed.list('for-you', null);
    expect(Array.isArray(publicFeed.items)).toBe(true);
    await api.feed.list('communities', null);

    const clientId = crypto.randomUUID();
    const input = { clientId, text: `Feed integration test ${new Date().toISOString()}`, communityId, media: [], link: 'https://kinnoc.com' };
    const post = await api.feed.create(input);
    let deleted = false;
    try {
      expect(post).toMatchObject({ isMine: true, community: { id: communityId }, link: { domain: 'kinnoc.com' } });
      // Retrying with the same client ID returns the original.
      expect((await api.feed.create(input)).id).toBe(post.id);
      expect((await api.feed.community(communityId, null)).items.some((p) => p.id === post.id)).toBe(true);
      // Members-only community posts never reach the public feed.
      expect((await api.feed.list('for-you', null)).items.some((p) => p.id === post.id)).toBe(false);

      const edited = await api.feed.update(post.id, { text: 'Edited by the test', link: null });
      expect(edited).toMatchObject({ text: 'Edited by the test', link: null, editedAt: expect.any(String) });

      expect(await api.feed.setLiked(post.id, true)).toEqual({ likeCount: 1, likedByMe: true });
      expect(await api.feed.setLiked(post.id, true)).toEqual({ likeCount: 1, likedByMe: true });
      expect(await api.feed.setLiked(post.id, false)).toEqual({ likeCount: 0, likedByMe: false });

      const top = await api.feed.comment(post.id, { clientId: crypto.randomUUID(), text: 'Top-level comment', parentId: null });
      const reply = await api.feed.comment(post.id, { clientId: crypto.randomUUID(), text: 'A reply', parentId: top.id });
      await expect(api.feed.comment(post.id, { clientId: crypto.randomUUID(), text: 'Too deep', parentId: reply.id })).rejects.toMatchObject({
        serverCode: 'INVALID_PARENT',
      });
      expect((await api.feed.replies(post.id, top.id, null)).items.map((c) => c.id)).toEqual([reply.id]);
      expect(await api.feed.editComment(post.id, reply.id, 'Edited reply')).toMatchObject({ text: 'Edited reply', editedAt: expect.any(String) });
      expect((await api.feed.get(post.id)).commentCount).toBe(2);
      await api.feed.removeComment(post.id, top.id);
      // A deleted comment with replies stays listed as a placeholder.
      expect((await api.feed.comments(post.id, null)).items[0]).toMatchObject({ id: top.id, author: null, deletedAt: expect.any(String) });

      // A key that was never uploaded is refused.
      await expect(
        api.feed.create({ ...input, clientId: crypto.randomUUID(), media: [{ key: 'not-mine/none.jpg', url: '', width: 1, height: 1 }] }),
      ).rejects.toMatchObject({ serverCode: 'INVALID_MEDIA' });

      await api.feed.remove(post.id);
      deleted = true;
      await expect(api.feed.get(post.id)).rejects.toMatchObject({ serverCode: 'POST_NOT_FOUND' });
    } finally {
      if (!deleted) await api.feed.remove(post.id).catch(() => undefined);
    }
  });

  it('attaches an image uploaded to post media with the user’s own session', async () => {
    const { data } = await supabase.auth.getSession();
    const key = `${data.session!.user.id}/${crypto.randomUUID()}.jpg`;
    // The smallest valid JPEG (1×1 pixel).
    const jpeg = Uint8Array.from(
      atob(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      ),
      (c) => c.charCodeAt(0),
    );
    const upload = await supabase.storage.from('post-media').upload(key, jpeg, { contentType: 'image/jpeg', upsert: false });
    expect(upload.error).toBeNull();
    try {
      const post = await api.feed.create({
        clientId: crypto.randomUUID(),
        text: 'Image integration test',
        communityId,
        media: [{ key, url: '', width: 1, height: 1 }],
        link: null,
      });
      expect(post.media).toEqual([expect.objectContaining({ url: expect.stringContaining(key), width: 1, height: 1 })]);
      await api.feed.remove(post.id);
    } finally {
      await supabase.storage.from('post-media').remove([key]);
    }
  });

  it('lists the user’s posts on their profile, by account and by username', async () => {
    const account = await api.account.load();
    const post = await api.feed.create({ clientId: crypto.randomUUID(), text: 'Profile posts test', communityId, media: [], link: null });
    try {
      const mine = await api.profile.posts(account.id, null);
      expect(mine.items[0]).toMatchObject({ id: post.id, isMine: true });
      const byUsername = await api.profile.posts(account.profile!.username, null);
      expect(byUsername.items.some((p) => p.id === post.id)).toBe(true);
      await api.feed.remove(post.id);
      expect((await api.profile.posts(account.id, null)).items.some((p) => p.id === post.id)).toBe(false);
    } finally {
      await api.feed.remove(post.id).catch(() => undefined);
    }
  });

  it('reports a deleted or unknown post as gone', async () => {
    const error = await api.feed.get('00000000-0000-4000-8000-000000000000').catch((e: unknown) => e);
    expect(isApiError(error, 'POST_NOT_FOUND')).toBe(true);
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
