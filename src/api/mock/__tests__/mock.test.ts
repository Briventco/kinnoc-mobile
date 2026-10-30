import { createMockBackend } from '..';

jest.setTimeout(20_000);

// The mock answers after short delays and schedules a fake typing indicator after each send;
// clock-driven timers let the test end without waiting for those.
beforeAll(() => jest.useFakeTimers({ advanceTimers: true }));
afterAll(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** The sample-data adapter follows the same membership rules as the API, so screens behave alike. */
describe('mock backend', () => {
  const { api } = createMockBackend(() => null);

  it('lists only public communities and filters by category', async () => {
    const all = await api.communities.browse({ query: '', category: null }, null);
    expect(all.items.every((c) => c.visibility === 'public')).toBe(true);
    const writing = await api.communities.browse({ query: '', category: 'writing' }, null);
    expect(writing.items.map((c) => c.categorySlug)).toEqual(['writing']);
  });

  it('joins open communities, requests approval ones, and accepts invitations', async () => {
    expect((await api.communities.join('c_gaming')).membership).toBe('member');
    expect((await api.communities.join('c_writers')).membership).toBe('pending');
    await api.communities.cancelRequest('c_writers');
    expect((await api.communities.get('c_writers')).membership).toBe('none');
    expect((await api.communities.join('c_data')).membership).toBe('member');
  });

  it('creates private communities as invite-only, owned by the creator', async () => {
    const created = await api.communities.create({ name: 'Invite Test', description: 'x', category: 'design', visibility: 'private', joinPolicy: 'open' });
    expect(created.joinPolicy).toBe('invite-only');
    expect(created.role).toBe('owner');
  });

  it('does not let the owner leave', async () => {
    await expect(api.communities.leave('c_tech')).rejects.toMatchObject({ serverCode: 'OWNER_CANNOT_LEAVE' });
  });

  it('sends idempotently by client ID and numbers messages', async () => {
    const input = { communityId: 'c_tech', clientId: 'k-1', text: 'Hello', replyToId: null, attachmentUris: [] };
    const first = await api.messages.send(input);
    const again = await api.messages.send(input);
    expect(again.id).toBe(first.id);
    expect(first.seq).toBeGreaterThan(1);
    const since = await api.messages.since('c_tech', (first.seq ?? 0) - 1, null);
    expect(since.items.map((m) => m.id)).toEqual([first.id]);
  });

  it('deletes a message but keeps its place', async () => {
    const sent = await api.messages.send({ communityId: 'c_tech', clientId: 'k-2', text: 'Oops', replyToId: null, attachmentUris: [] });
    await api.messages.remove('c_tech', sent.id);
    const latest = await api.messages.list('c_tech', null);
    expect(latest.items.find((m) => m.id === sent.id)).toMatchObject({ text: '', deletedAt: expect.any(String) });
  });

  it('creates posts idempotently and supports one level of replies', async () => {
    const input = { clientId: 'post-1', text: 'Hello from the mock', communityId: null, media: [], link: 'https://kinnoc.com' };
    const post = await api.feed.create(input);
    expect(await api.feed.create(input)).toMatchObject({ id: post.id });
    expect(post.link).toEqual({ url: 'https://kinnoc.com', domain: 'kinnoc.com' });

    const top = await api.feed.comment(post.id, { clientId: 'cm-1', text: 'First', parentId: null });
    const reply = await api.feed.comment(post.id, { clientId: 'cm-2', text: 'Reply', parentId: top.id });
    await expect(api.feed.comment(post.id, { clientId: 'cm-3', text: 'Too deep', parentId: reply.id })).rejects.toMatchObject({ serverCode: 'INVALID_PARENT' });
    expect((await api.feed.get(post.id)).commentCount).toBe(2);

    // A deleted comment with replies stays as a placeholder.
    await api.feed.removeComment(post.id, top.id);
    const comments = await api.feed.comments(post.id, null);
    expect(comments.items[0]).toMatchObject({ id: top.id, text: '', author: null, deletedAt: expect.any(String) });
    expect((await api.feed.replies(post.id, top.id, null)).items.map((c) => c.id)).toEqual([reply.id]);
  });

  it('sets and removes the profile photo, on the profile and on your posts', async () => {
    const post = await api.feed.create({ clientId: 'photo-test', text: 'Hello', communityId: null, media: [], link: null });
    const me = await api.profile.setAvatar('file:///photo.jpg');
    expect(me.avatarUrl).toBe('file:///photo.jpg');
    expect((await api.feed.get(post.id)).author.avatarUrl).toBe('file:///photo.jpg');
    expect((await api.profile.removeAvatar()).avatarUrl).toBeNull();
  });
});
