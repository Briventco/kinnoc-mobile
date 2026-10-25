import { createHttpApi } from '..';
import type { HttpClient } from '../client';
import { apiCommunity, apiMessage } from '../__fixtures__/payloads';

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

const upload = jest.fn(async () => ({ key: 'u/1.jpg', url: 'https://x/u/1.jpg' }));
const page = <T>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });

describe('createHttpApi', () => {
  it('joins with POST /join and returns the community as the server now sees it', async () => {
    const { client, calls } = fakeClient((method) =>
      method === 'POST' ? { status: 'ACTIVE', role: 'MEMBER', joinedAt: 'x' } : apiCommunity({ membership: { status: 'ACTIVE', role: 'MEMBER', joinedAt: 'x' } }),
    );
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    const c = await api.communities.join('c1');
    expect(calls.map(([m, p]) => `${m} ${p}`)).toEqual(['POST /communities/c1/join', 'GET /communities/c1']);
    expect(c.membership).toBe('member');
  });

  it('only searches with two or more characters and passes the category', async () => {
    const { client, calls } = fakeClient(() => page([apiCommunity()]));
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    await api.communities.browse({ query: 'd', category: 'design' }, null);
    await api.communities.browse({ query: ' de ', category: null }, 'next');
    expect(calls[0][2]?.query).toEqual({ q: undefined, category: 'design', cursor: null });
    expect(calls[1][2]?.query).toEqual({ q: 'de', category: null, cursor: 'next' });
  });

  it('uses the documented routes for membership and moderation', async () => {
    const { client, calls } = fakeClient(() => ({ username: 'ada', displayName: 'Ada', avatarUrl: null, role: 'MODERATOR', joinedAt: 'x' }));
    const api = createHttpApi(client, { uploadCommunityImage: upload });
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
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    const result = await api.communities.mine('invited', null);
    expect(calls[0]).toEqual(['GET', '/users/me/communities', { query: { status: 'INVITED', cursor: null, limit: undefined } }]);
    expect(result.items[0].membership).toBe('invited');
  });

  it('catches up with ?after= first, then follows the cursor alone', async () => {
    const { client, calls } = fakeClient(() => page([apiMessage({ seq: 8 })], null));
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    await api.messages.since('c1', 7, null);
    await api.messages.since('c1', 7, 'cur');
    expect(calls[0][2]?.query).toEqual({ after: 7, limit: 50 });
    expect(calls[1][2]?.query).toEqual({ cursor: 'cur', limit: 50 });
  });

  it('sends messages with the client ID and only a reply ID when replying', async () => {
    const { client, calls } = fakeClient(() => apiMessage({ isMine: true, clientId: 'k1' }));
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    await api.messages.send({ communityId: 'c1', clientId: 'k1', text: 'Hi', replyToId: null, attachmentUris: [] });
    await api.messages.send({ communityId: 'c1', clientId: 'k2', text: 'Re', replyToId: 'm1', attachmentUris: [] });
    expect(calls[0][2]?.body).toEqual({ text: 'Hi', clientId: 'k1' });
    expect(calls[1][2]?.body).toEqual({ text: 'Re', clientId: 'k2', replyToId: 'm1' });
  });

  it('marks read with or without a message ID', async () => {
    const { client, calls } = fakeClient(() => undefined);
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    await api.communities.markRead('c1', 'm9');
    await api.communities.markRead('c1', null);
    expect(calls.map((c) => c[2]?.body)).toEqual([{ lastMessageId: 'm9' }, {}]);
  });

  it('provisions the account on load', async () => {
    const { client, calls } = fakeClient(() => ({ id: 'u1', email: 'a@b.c', profile: null, interests: [] }));
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    await expect(api.account.load()).resolves.toEqual({ id: 'u1', email: 'a@b.c', profile: null });
    expect(calls[0].slice(0, 2)).toEqual(['POST', '/users/provision']);
  });

  it('reports features the API does not have as unsupported, and says so in capabilities', async () => {
    const { client } = fakeClient(() => undefined);
    const api = createHttpApi(client, { uploadCommunityImage: upload });
    expect(api.capabilities).toMatchObject({ social: false, reactions: false, messageAttachments: false, inboxPreferences: false });
    await expect(api.feed.list('for-you', null)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(api.messages.react('m1', '👍', true)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(api.communities.setMuted('c1', true)).rejects.toMatchObject({ code: 'unsupported' });
  });
});
