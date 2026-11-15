import { ApiError } from '@/api/errors';
import { createHttpGroupsApi, GROUP_ROUTES, toCommunityGroup } from '@/api/http/groups';

function makeClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

const sampleApiGroup = {
  id: 'grp_1',
  communityId: 'comm_1',
  name: 'Organising Team',
  description: 'Event logistics and stage prep.',
  avatarUrl: null,
  iconName: 'shield',
  memberCount: 12,
  joinPolicy: 'INVITE_ONLY' as const,
  membership: 'ACTIVE' as const,
  role: 'ADMIN' as const,
  unreadCount: 0,
  isMuted: false,
  isDefault: false,
  lastMessage: null,
  receipts: null,
  permissions: {
    canJoin: false,
    canLeave: true,
    canEdit: true,
    canDelete: true,
    canManageMembers: true,
    canSendMessages: true,
  },
  createdAt: '2026-11-01T10:00:00.000Z',
};

const sampleApiMessage = {
  id: 'm_1',
  clientId: null,
  communityId: 'grp_1',
  seq: 4,
  sender: { username: 'ada', displayName: 'Adaeze', avatarUrl: null },
  isMine: false,
  text: 'Stage schedule is ready.',
  sentAt: '2026-11-14T18:00:00.000Z',
  deletedAt: null,
  replyTo: null,
};

describe('createHttpGroupsApi', () => {
  it('maps community groups list, merges inbox state, and derives conservative permissions', async () => {
    const client = makeClient();
    client.get
      .mockResolvedValueOnce({
        items: [
          { ...sampleApiGroup, unreadCount: undefined },
          {
            id: 'grp_2',
            communityId: 'comm_1',
            name: 'Volunteers',
            description: '',
            memberCount: 4,
            joinPolicy: 'OPEN' as const,
            membership: 'NONE' as const,
            role: null,
            isDefault: false,
            createdAt: '2026-11-02T10:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce([
        {
          group: { id: 'grp_1' },
          unreadCount: 5,
          receipts: { deliveredSeq: 6, readSeq: 4 },
          lastMessage: {
            seq: 6,
            senderName: 'Adaeze',
            isMine: false,
            text: 'Stage schedule is ready.',
            kind: 'TEXT',
            sentAt: '2026-11-14T18:00:00.000Z',
          },
        },
      ]);

    const groups = createHttpGroupsApi(client as never);
    const res = await groups.list('comm_1');

    expect(client.get).toHaveBeenCalledWith(GROUP_ROUTES.list('comm_1'));
    expect(client.get).toHaveBeenCalledWith(GROUP_ROUTES.inbox, { query: { scope: 'groups' } });
    expect(res.items[0]).toMatchObject({
      id: 'grp_1',
      communityId: 'comm_1',
      name: 'Organising Team',
      joinPolicy: 'invite-only',
      membership: 'member',
      role: 'admin',
      unreadCount: 5,
      receipts: { deliveredSeq: 6, readSeq: 4 },
      lastMessage: {
        seq: 6,
        senderName: 'Adaeze',
        isMine: false,
        text: 'Stage schedule is ready.',
        kind: 'text',
        sentAt: '2026-11-14T18:00:00.000Z',
      },
      permissions: {
        canJoin: false,
        canLeave: true,
        canEdit: true,
        canDelete: true,
        canManageMembers: true,
        canSendMessages: true,
      },
    });
    expect(res.items[1]).toMatchObject({
      id: 'grp_2',
      membership: 'none',
      role: null,
      permissions: {
        canJoin: true,
        canLeave: false,
        canEdit: false,
        canDelete: false,
        canManageMembers: false,
        canSendMessages: false,
      },
    });
  });

  it('converts generic NOT_FOUND into an unsupported error when backend routes are absent', async () => {
    const client = makeClient();
    client.get.mockRejectedValue(new ApiError('not_found', 'Not found', 404, {}, 'NOT_FOUND'));

    const groups = createHttpGroupsApi(client as never);
    await expect(groups.list('comm_1')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('posts group creation (iconKey + visibility), handles GroupMembershipResponse on join, leaves, and sends messages', async () => {
    const client = makeClient();
    client.post
      .mockResolvedValueOnce(sampleApiGroup)
      .mockResolvedValueOnce({ role: 'MEMBER', joinedAt: '2026-11-15T10:00:00.000Z' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(sampleApiMessage)
      .mockResolvedValueOnce(sampleApiMessage);
    client.get.mockResolvedValueOnce({
      ...sampleApiGroup,
      membership: 'ACTIVE',
      role: 'MEMBER',
    });

    const groups = createHttpGroupsApi(client as never);

    await groups.create('comm_1', {
      name: 'Volunteers',
      description: 'Event day crew',
      joinPolicy: 'invite-only',
      iconName: 'users',
      avatarKey: 'icons/volunteers.png',
    });
    expect(client.post).toHaveBeenCalledWith(GROUP_ROUTES.list('comm_1'), {
      body: {
        name: 'Volunteers',
        description: 'Event day crew',
        visibility: 'PRIVATE',
        iconKey: 'icons/volunteers.png',
      },
    });

    const joined = await groups.join('comm_1', 'grp_1');
    expect(client.post).toHaveBeenCalledWith(GROUP_ROUTES.join('comm_1', 'grp_1'));
    expect(client.get).toHaveBeenCalledWith(GROUP_ROUTES.get('comm_1', 'grp_1'));
    expect(joined.membership).toBe('member');
    expect(joined.role).toBe('member');

    await groups.leave('comm_1', 'grp_1');
    expect(client.post).toHaveBeenCalledWith(GROUP_ROUTES.leave('comm_1', 'grp_1'));

    await groups.sendMessage('comm_1', 'grp_1', {
      clientId: 'cid_1',
      text: 'Hello team',
      replyToId: null,
      attachmentUris: [],
    });
    expect(client.post).toHaveBeenCalledWith(GROUP_ROUTES.messages('comm_1', 'grp_1'), {
      body: { clientId: 'cid_1', text: 'Hello team' },
    });

    await groups.sendMessage('comm_1', 'grp_1', {
      clientId: 'cid_2',
      text: 'Replying now',
      replyToId: 'msg_0',
      attachmentUris: [],
    });
    expect(client.post).toHaveBeenCalledWith(GROUP_ROUTES.messages('comm_1', 'grp_1'), {
      body: { clientId: 'cid_2', text: 'Replying now', replyToId: 'msg_0' },
    });
  });

  it('rejects group message attachments and mute in HTTP mode with unsupported', async () => {
    const client = makeClient();
    const groups = createHttpGroupsApi(client as never);

    await expect(
      groups.sendMessage('comm_1', 'grp_1', {
        clientId: 'cid_3',
        text: 'Stage photo',
        replyToId: null,
        attachmentUris: ['file:///tmp/stage.jpg'],
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
    expect(client.post).not.toHaveBeenCalled();

    await expect(groups.setMuted('comm_1', 'grp_1', true)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('uses the backend after parameter for group message catch-up', async () => {
    const client = makeClient();
    client.get.mockResolvedValue({ items: [sampleApiMessage], nextCursor: null, receipts: { deliveredSeq: 4, readSeq: 4 } });

    const groups = createHttpGroupsApi(client as never);
    await groups.messagesSince('comm_1', 'grp_1', 4);

    expect(client.get).toHaveBeenCalledWith(GROUP_ROUTES.messages('comm_1', 'grp_1'), {
      query: { after: 4 },
    });
  });

  it('maps slim lastMessage contracts, image attachments, and deleted messages accurately', () => {
    const slimGroup = toCommunityGroup({
      ...sampleApiGroup,
      iconUrl: 'https://cdn.example/group-icon.png',
      avatarUrl: null,
      lastMessage: {
        seq: 12,
        senderName: 'Tobi',
        isMine: false,
        text: 'Check this flyer',
        kind: 'IMAGE',
        sentAt: '2026-11-14T18:10:00.000Z',
      },
    });
    expect(slimGroup.photoUrl).toBe('https://cdn.example/group-icon.png');
    expect(slimGroup.lastMessage).toEqual({
      seq: 12,
      senderName: 'Tobi',
      isMine: false,
      text: 'Check this flyer',
      kind: 'photo',
      sentAt: '2026-11-14T18:10:00.000Z',
    });

    const mineDeleted = toCommunityGroup({
      ...sampleApiGroup,
      lastMessage: {
        seq: 13,
        isMine: true,
        text: 'Secret',
        deletedAt: '2026-11-14T18:11:00.000Z',
        sentAt: '2026-11-14T18:10:30.000Z',
      },
    });
    expect(mineDeleted.lastMessage).toMatchObject({
      senderName: 'You',
      isMine: true,
      text: 'Message deleted',
      kind: 'text',
    });
  });
});
