import { ApiError } from '../../errors';
import { createHttpApi } from '..';
import type { HttpClient } from '../client';
import { apiComment, apiCommunity, apiEvent, apiMessage, apiPost } from '../__fixtures__/payloads';

type Call = [method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown }];

/** A client that records requests and answers by method and path. */
function fakeClient(answer: (method: string, path: string) => unknown) {
  const calls: Call[] = [];
  const make =
    (method: string) =>
    async (path: string, opts?: Call[2]) => {
      calls.push([method, path, opts]);
      return answer(method, path);
    };
  const client = { get: make('GET'), post: make('POST'), put: make('PUT'), patch: make('PATCH'), delete: make('DELETE') } as unknown as HttpClient;
  return { client, calls };
}

const upload = jest.fn(async () => ({ key: 'u/1.jpg', url: 'https://x/u/1.jpg', width: 800, height: 600 }));
const removeAvatarFile = jest.fn(async (_key: string) => undefined);
const options = { uploadCommunityImage: upload, uploadPostImage: upload, uploadAvatar: upload, removeAvatarFile };
const page = <T>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });

describe('createHttpApi', () => {
  it('joins with POST /join and returns the community as the server now sees it', async () => {
    const { client, calls } = fakeClient((method) =>
      method === 'POST' ? { status: 'ACTIVE', role: 'MEMBER', joinedAt: 'x' } : apiCommunity({ membership: { status: 'ACTIVE', role: 'MEMBER', joinedAt: 'x' } }),
    );
    const api = createHttpApi(client, options);
    const c = await api.communities.join('c1');
    expect(calls.map(([m, p]) => `${m} ${p}`)).toEqual(['POST /communities/c1/join', 'GET /communities/c1']);
    expect(c.membership).toBe('member');
  });

  it('only searches with two or more characters and passes the category', async () => {
    const { client, calls } = fakeClient(() => page([apiCommunity()]));
    const api = createHttpApi(client, options);
    await api.communities.browse({ query: 'd', category: 'design' }, null);
    await api.communities.browse({ query: ' de ', category: null }, 'next');
    expect(calls[0][2]?.query).toEqual({ q: undefined, category: 'design', cursor: null });
    expect(calls[1][2]?.query).toEqual({ q: 'de', category: null, cursor: 'next' });
  });

  it('uses the documented routes for membership and moderation', async () => {
    const { client, calls } = fakeClient(() => ({ username: 'ada', displayName: 'Ada', avatarUrl: null, role: 'MODERATOR', joinedAt: 'x' }));
    const api = createHttpApi(client, options);
    await api.communities.leave('c1');
    await api.communities.cancelRequest('c1');
    await api.communities.declineInvitation('c1');
    await api.communities.setRole('c1', 'ada', 'moderator');
    await api.communities.removeMember('c1', 'ada');
    await api.communities.transferOwnership('c1', 'ada');
    await api.communities.approveRequest('c1', 'ada');
    await api.communities.rejectRequest('c1', 'ada');
    await api.communities.revokeInvitation('c1', 'ada');
    expect(calls.map(([m, p, o]) => `${m} ${p}${o?.body ? ` ${JSON.stringify(o.body)}` : ''}`)).toEqual([
      'POST /communities/c1/leave',
      'DELETE /communities/c1/join-request',
      'DELETE /communities/c1/invitation',
      'PATCH /communities/c1/members/ada {"role":"MODERATOR"}',
      'DELETE /communities/c1/members/ada',
      'POST /communities/c1/transfer-ownership {"username":"ada"}',
      'POST /communities/c1/join-requests/ada/approve',
      'POST /communities/c1/join-requests/ada/reject',
      'DELETE /communities/c1/invitations/ada',
    ]);
  });

  it('lists the viewer’s invitations with the API status names', async () => {
    const { client, calls } = fakeClient(() => page([apiCommunity({ membership: { status: 'INVITED', role: null, joinedAt: null } })]));
    const api = createHttpApi(client, options);
    const result = await api.communities.mine('invited', null);
    expect(calls[0]).toEqual(['GET', '/users/me/communities', { query: { status: 'INVITED', cursor: null, limit: undefined } }]);
    expect(result.items[0].membership).toBe('invited');
  });

  it('catches up with ?after= first, then follows the cursor alone', async () => {
    const { client, calls } = fakeClient(() => page([apiMessage({ seq: 8 })], null));
    const api = createHttpApi(client, options);
    await api.messages.since('c1', 7, null);
    await api.messages.since('c1', 7, 'cur');
    expect(calls[0][2]?.query).toEqual({ after: 7, limit: 50 });
    expect(calls[1][2]?.query).toEqual({ cursor: 'cur', limit: 50 });
  });

  it('sends messages with the client ID and only a reply ID when replying', async () => {
    const { client, calls } = fakeClient(() => apiMessage({ isMine: true, clientId: 'k1' }));
    const api = createHttpApi(client, options);
    await api.messages.send({ communityId: 'c1', clientId: 'k1', text: 'Hi', replyToId: null, attachmentUris: [] });
    await api.messages.send({ communityId: 'c1', clientId: 'k2', text: 'Re', replyToId: 'm1', attachmentUris: [] });
    expect(calls[0][2]?.body).toEqual({ text: 'Hi', clientId: 'k1' });
    expect(calls[1][2]?.body).toEqual({ text: 'Re', clientId: 'k2', replyToId: 'm1' });
  });

  it('marks read with or without a message ID', async () => {
    const { client, calls } = fakeClient(() => undefined);
    const api = createHttpApi(client, options);
    await api.communities.markRead('c1', 'm9');
    await api.communities.markRead('c1', null);
    expect(calls.map((c) => c[2]?.body)).toEqual([{ lastMessageId: 'm9' }, {}]);
  });

  it('provisions the account on load', async () => {
    const { client, calls } = fakeClient(() => ({ id: 'u1', email: 'a@b.c', profile: null, interests: [] }));
    const api = createHttpApi(client, options);
    await expect(api.account.load()).resolves.toEqual({ id: 'u1', email: 'a@b.c', profile: null, status: 'active' });
    expect(calls[0].slice(0, 2)).toEqual(['POST', '/users/provision']);
  });

  it('keeps receipts from message pages, and none from an API that sends none', async () => {
    const { client } = fakeClient((_m, path) =>
      path.endsWith('/messages') ? { ...page([apiMessage()]), receipts: { deliveredSeq: 7, readSeq: 5 } } : page([apiMessage()]),
    );
    const api = createHttpApi(client, options);
    await expect(api.messages.list('c1', null)).resolves.toMatchObject({ receipts: { deliveredSeq: 7, readSeq: 5 } });
    await expect(api.messages.since('c1', 6, null)).resolves.toMatchObject({ receipts: { deliveredSeq: 7, readSeq: 5 } });
    const { client: old } = fakeClient(() => page([apiMessage()]));
    await expect(createHttpApi(old, options).messages.list('c1', null)).resolves.toMatchObject({ receipts: null });
  });

  it('loads the public and communities feeds, and a community’s posts, with the cursor', async () => {
    const { client, calls } = fakeClient(() => page([apiPost()], 'next'));
    const api = createHttpApi(client, options);
    const feed = await api.feed.list('for-you', null);
    await api.feed.list('communities', 'cur');
    await api.feed.community('design-lab', 'cur2');
    expect(calls.map(([m, p, o]) => [m, p, o?.query])).toEqual([
      ['GET', '/feed', { scope: 'public', cursor: null }],
      ['GET', '/feed', { scope: 'communities', cursor: 'cur' }],
      ['GET', '/communities/design-lab/posts', { cursor: 'cur2' }],
    ]);
    expect(feed).toMatchObject({ nextCursor: 'next', items: [{ kind: 'post', id: apiPost().id }] });
    // There is no following feed in the API.
    await expect(api.feed.list('following', null)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('creates posts with the client ID, uploaded image keys and only the fields given', async () => {
    const { client, calls } = fakeClient(() => apiPost({ isMine: true }));
    const api = createHttpApi(client, options);
    await api.feed.create({ clientId: 'k1', text: 'Hello', communityId: null, media: [], link: null });
    await api.feed.create({
      clientId: 'k2',
      text: 'With all',
      communityId: 'c1',
      media: [{ key: 'u1/a.jpg', url: 'https://x/a.jpg', width: 1600, height: 900 }],
      link: 'https://kinnoc.com/jobs',
    });
    expect(calls.map(([m, p, o]) => [m, p, o?.body])).toEqual([
      ['POST', '/posts', { text: 'Hello', clientId: 'k1' }],
      [
        'POST',
        '/posts',
        { text: 'With all', clientId: 'k2', communityId: 'c1', media: [{ key: 'u1/a.jpg', width: 1600, height: 900 }], link: 'https://kinnoc.com/jobs' },
      ],
    ]);
  });

  it('edits, deletes, likes and unlikes posts on the documented routes', async () => {
    const { client, calls } = fakeClient((method, path) =>
      path.endsWith('/like') ? { likeCount: method === 'PUT' ? 3 : 2, likedByMe: method === 'PUT' } : apiPost({ editedAt: 'x' }),
    );
    const api = createHttpApi(client, options);
    await api.feed.update('p1', { link: null });
    await api.feed.remove('p1');
    await expect(api.feed.setLiked('p1', true)).resolves.toEqual({ likeCount: 3, likedByMe: true });
    await expect(api.feed.setLiked('p1', false)).resolves.toEqual({ likeCount: 2, likedByMe: false });
    expect(calls.map(([m, p, o]) => `${m} ${p}${o?.body ? ` ${JSON.stringify(o.body)}` : ''}`)).toEqual([
      'PATCH /posts/p1 {"link":null}',
      'DELETE /posts/p1',
      'PUT /posts/p1/like',
      'DELETE /posts/p1/like',
    ]);
  });

  it('lists, adds, replies to, edits and deletes comments', async () => {
    const { client, calls } = fakeClient((method) => (method === 'GET' ? page([apiComment()]) : apiComment({ isMine: true })));
    const api = createHttpApi(client, options);
    await api.feed.comments('p1', null);
    await api.feed.replies('p1', 'c1', 'cur');
    await api.feed.comment('p1', { clientId: 'k1', text: 'Nice', parentId: null });
    await api.feed.comment('p1', { clientId: 'k2', text: 'Agreed', parentId: 'c1' });
    await api.feed.editComment('p1', 'c1', 'Edited');
    await api.feed.removeComment('p1', 'c1');
    expect(calls.map(([m, p, o]) => `${m} ${p}${o?.body ? ` ${JSON.stringify(o.body)}` : ''}${o?.query ? ` ?${JSON.stringify(o.query)}` : ''}`)).toEqual([
      'GET /posts/p1/comments ?{"cursor":null}',
      'GET /posts/p1/comments/c1/replies ?{"cursor":"cur"}',
      'POST /posts/p1/comments {"text":"Nice","clientId":"k1"}',
      'POST /posts/p1/comments {"text":"Agreed","clientId":"k2","parentId":"c1"}',
      'PATCH /posts/p1/comments/c1 {"text":"Edited"}',
      'DELETE /posts/p1/comments/c1',
    ]);
  });

  it('lists the viewer’s own posts, and other people’s by username', async () => {
    const { client, calls } = fakeClient((_m, path) =>
      path === '/users/me' ? { id: 'u1', email: null, profile: null, interests: [] } : path === '/users/me/inbox' ? [] : page([apiPost({ isMine: true })], 'next'),
    );
    const api = createHttpApi(client, options);
    await api.profile.me();
    const mine = await api.profile.posts('u1', null);
    await api.profile.posts('ada', 'cur');
    expect(mine).toMatchObject({ nextCursor: 'next', items: [{ isMine: true }] });
    expect(calls.slice(2).map(([m, p, o]) => [m, p, o?.query])).toEqual([
      ['GET', '/users/me/posts', { cursor: null }],
      ['GET', '/profiles/ada/posts', { cursor: 'cur' }],
    ]);
  });

  it('shows the posts list as not available yet when the API does not have the route', async () => {
    const { client } = fakeClient(() => {
      throw new ApiError('not_found', 'Not found', 404, {}, 'NOT_FOUND');
    });
    await expect(createHttpApi(client, options).profile.posts('u1', null)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('reports features the API does not have as unsupported, and says so in capabilities', async () => {
    const { client } = fakeClient(() => undefined);
    const api = createHttpApi(client, options);
    expect(api.capabilities).toMatchObject({ feed: true, social: false, reactions: false, messageAttachments: false, inboxPreferences: false });
    await expect(api.messages.react('m1', '👍', true)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(api.communities.setMuted('c1', true)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('replaces interests with PUT /users/me/interests, then reloads the profile with names and slugs', async () => {
    const account = { id: 'u1', email: 'a@b.c', profile: { username: 'ada', displayName: 'Ada', bio: null, avatarKey: null, avatarUrl: null }, interests: [{ slug: 'design', name: 'Design' }] };
    const { client, calls } = fakeClient((method, path) => (path === '/users/me/inbox' ? [] : method === 'PUT' ? [] : account));
    const api = createHttpApi(client, options);
    const profile = await api.profile.setInterests(['design']);
    expect(calls[0]).toEqual(['PUT', '/users/me/interests', { body: { interests: ['design'] } }]);
    expect(profile).toMatchObject({ interests: ['Design'], interestSlugs: ['design'] });
    expect(api.capabilities.interestCatalogue).toBe(true);
  });

  describe('verification', () => {
    const body = { isVerified: true, status: 'ACTIVE', category: 'FOUNDER', organisation: 'Brivent', position: 'Founder', verifiedAt: '2026-10-30T09:00:00.000Z' };

    it('looks up a profile badge by username', async () => {
      const { client, calls } = fakeClient(() => body);
      const api = createHttpApi(client, options);
      expect(await api.verification.profile('ada lovelace')).toMatchObject({ isVerified: true, category: 'founder' });
      expect(calls[0]).toEqual(['GET', '/profiles/ada%20lovelace/verification', undefined]);
    });

    it('reads a hidden or deleted profile as unverified, and passes on real failures', async () => {
      const { client } = fakeClient((_m, path) => {
        if (path.startsWith('/profiles/gone')) throw new ApiError('not_found', 'Profile not found', 404, {}, 'PROFILE_NOT_FOUND');
        throw new ApiError('server', 'Down', 500);
      });
      const api = createHttpApi(client, options);
      expect(await api.verification.profile('gone')).toMatchObject({ isVerified: false });
      await expect(api.verification.profile('ada')).rejects.toMatchObject({ code: 'server' });
    });

    it('loads your own verification from /users/me/verification', async () => {
      const { client, calls } = fakeClient(() => ({ ...body, isVerified: false, status: 'EXPIRED', expiresAt: '2026-10-01T00:00:00.000Z' }));
      const api = createHttpApi(client, options);
      expect(await api.verification.mine()).toMatchObject({ isVerified: false, status: 'expired' });
      expect(calls[0][1]).toBe('/users/me/verification');
    });
  });

  describe('events', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

    it('builds Discover from upcoming published events: this week first, later ones below', async () => {
      const events = [apiEvent({ id: 'e1', startAt: at(1) }), apiEvent({ id: 'e2', startAt: at(3) }), apiEvent({ id: 'e3', startAt: at(20) })];
      const { client, calls } = fakeClient(() => page(events));
      const api = createHttpApi(client, options);
      const home = await api.discover.home();
      expect(calls[0]).toEqual(['GET', '/events', { query: { limit: 12 } }]);
      expect(home.thisWeek.map((e) => e.id)).toEqual(['e1', 'e2']);
      expect(home.upcomingEvents.map((e) => e.id)).toEqual(['e3']);
      expect(home).toMatchObject({ closingSoon: [], resources: [] });
      expect(api.capabilities.discoverKinds).toEqual(['event']);
    });

    it('pages and searches events, with two or more characters only', async () => {
      const { client, calls } = fakeClient(() => page([apiEvent()], 'next'));
      const api = createHttpApi(client, options);
      const first = await api.discover.list('events', '', null);
      await api.discover.list('all', 't', null);
      await api.discover.list('events', ' tedx ', 'next');
      expect(first).toMatchObject({ nextCursor: 'next', items: [{ kind: 'event', title: 'testing' }] });
      expect(calls.map((c) => c[2]?.query)).toEqual([
        { q: undefined, cursor: null },
        { q: undefined, cursor: null },
        { q: 'tedx', cursor: 'next' },
      ]);
    });

    it('does not invent opportunities or resources', async () => {
      const { client, calls } = fakeClient(() => page([]));
      const api = createHttpApi(client, options);
      await expect(api.discover.list('opportunities', '', null)).rejects.toMatchObject({ code: 'unsupported' });
      await expect(api.discover.list('resources', '', null)).rejects.toMatchObject({ code: 'unsupported' });
      expect(calls).toEqual([]);
    });

    it('loads one event by ID or slug, and passes on EVENT_NOT_FOUND', async () => {
      const { client, calls } = fakeClient((_m, path) => {
        if (path === '/events/gone') throw new ApiError('not_found', 'Event not found', 404, {}, 'EVENT_NOT_FOUND');
        if (path === '/events/broken') return { id: 'x' };
        return apiEvent({ status: 'CANCELLED', cancellationReason: 'Rain' });
      });
      const api = createHttpApi(client, options);
      expect(await api.discover.get('tedx 2026')).toMatchObject({ status: 'cancelled', cancellationReason: 'Rain' });
      expect(calls[0][1]).toBe('/events/tedx%202026');
      await expect(api.discover.get('gone')).rejects.toMatchObject({ serverCode: 'EVENT_NOT_FOUND' });
      await expect(api.discover.get('broken')).rejects.toMatchObject({ code: 'server' });
    });
  });

  describe('profile photos', () => {
    const account = (avatarKey: string | null) => ({
      id: 'u1',
      email: 'a@b.c',
      profile: { username: 'ada', displayName: 'Ada', bio: null, avatarKey, avatarUrl: avatarKey && `https://x/${avatarKey}` },
      interests: [],
    });
    beforeEach(() => removeAvatarFile.mockClear());

    it('uploads, saves the new key, then deletes the old file', async () => {
      let key: string | null = 'u/old.jpg';
      const { client, calls } = fakeClient((method, path) => {
        if (method === 'PATCH') key = 'u/1.jpg';
        return path === '/users/me/inbox' ? [] : account(key);
      });
      const profile = await createHttpApi(client, options).profile.setAvatar('file:///picked.heic');
      expect(upload).toHaveBeenCalledWith('file:///picked.heic');
      expect(calls.filter(([m]) => m === 'PATCH')).toEqual([['PATCH', '/profiles/me', { body: { avatarKey: 'u/1.jpg' } }]]);
      expect(removeAvatarFile.mock.calls).toEqual([['u/old.jpg']]);
      expect(profile.avatarUrl).toBe('https://x/u/1.jpg');
    });

    it('keeps the old photo and deletes the new upload when the API refuses it', async () => {
      const refused = new Error('Profile photos must be at most 2 MB');
      const { client } = fakeClient((method) => {
        if (method === 'PATCH') throw refused;
        return account('u/old.jpg');
      });
      await expect(createHttpApi(client, options).profile.setAvatar('file:///big.jpg')).rejects.toBe(refused);
      expect(removeAvatarFile.mock.calls).toEqual([['u/1.jpg']]);
    });

    it('still succeeds when the old file cannot be deleted', async () => {
      removeAvatarFile.mockRejectedValueOnce(new Error('offline'));
      const { client } = fakeClient((_m, path) => (path === '/users/me/inbox' ? [] : account('u/old.jpg')));
      await expect(createHttpApi(client, options).profile.setAvatar('file:///p.jpg')).resolves.toBeDefined();
    });

    it('removes with avatarKey null, then deletes the file', async () => {
      let key: string | null = 'u/old.jpg';
      const { client, calls } = fakeClient((method, path) => {
        if (method === 'PATCH') key = null;
        return path === '/users/me/inbox' ? [] : account(key);
      });
      const profile = await createHttpApi(client, options).profile.removeAvatar();
      expect(calls.filter(([m]) => m === 'PATCH')).toEqual([['PATCH', '/profiles/me', { body: { avatarKey: null } }]]);
      expect(removeAvatarFile.mock.calls).toEqual([['u/old.jpg']]);
      expect(profile.avatarUrl).toBeNull();
    });
  });
});
