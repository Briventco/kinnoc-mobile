/**
 * Isolated HTTP adapter for the proposed Community Groups API (see docs/community-groups.md).
 * Generic 404 responses (when the backend has not deployed group routes yet) are converted to
 * `unsupported('Community groups')` so callers never mistake missing endpoints for a broken item.
 */
import type { KinnocApi } from '../contract';
import { isApiError, unsupported } from '../errors';
import type {
  CommunityGroup,
  CommunityGroupInput,
  CommunityGroupMember,
  CommunityGroupsList,
  GroupJoinPolicy,
  GroupMembershipStatus,
  GroupPermissions,
  GroupRole,
  Page,
} from '../types';
import type { HttpClient } from './client';
import {
  type ApiMessage,
  type ApiMessagePage,
  type ApiPerson,
  type ApiReceipts,
  mapPage,
  monogramFor,
  toMessage,
  toMessagePage,
  toReceipts,
} from './mappers';

const enc = encodeURIComponent;

export const GROUP_ROUTES = {
  list: (communityId: string) => `/communities/${enc(communityId)}/groups`,
  get: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}`,
  join: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}/join`,
  leave: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}/leave`,
  members: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}/members`,
  member: (communityId: string, groupId: string, username: string) =>
    `/communities/${enc(communityId)}/groups/${enc(groupId)}/members/${enc(username)}`,
  read: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}/read`,
  messages: (communityId: string, groupId: string) => `/communities/${enc(communityId)}/groups/${enc(groupId)}/messages`,
  message: (communityId: string, groupId: string, messageId: string) =>
    `/communities/${enc(communityId)}/groups/${enc(groupId)}/messages/${enc(messageId)}`,
  inbox: '/users/me/inbox',
} as const;

export interface ApiGroupPermissions {
  canJoin?: boolean;
  canLeave?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageMembers?: boolean;
  canSendMessages?: boolean;
}

export interface ApiGroupLastMessage {
  seq?: number | null;
  senderName?: string | null;
  sender?: ApiPerson | null;
  isMine?: boolean;
  text?: string | null;
  kind?: 'TEXT' | 'IMAGE' | 'PHOTO' | 'LINK' | 'text' | 'photo' | 'link' | string | null;
  attachments?: { kind?: string }[] | null;
  link?: unknown | null;
  deletedAt?: string | null;
  sentAt: string;
}

export interface ApiCommunityGroup {
  id: string;
  communityId: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  iconUrl?: string | null;
  iconName?: string | null;
  memberCount: number;
  joinPolicy?: 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
  visibility?: 'PUBLIC' | 'PRIVATE';
  status?: 'ACTIVE' | 'ARCHIVED';
  membership: 'NONE' | 'ACTIVE' | 'REQUESTED' | { role: 'ADMIN' | 'MEMBER'; joinedAt: string } | null;
  role?: 'ADMIN' | 'MEMBER' | null;
  unreadCount?: number;
  isMuted?: boolean;
  isDefault?: boolean;
  lastMessage?: ApiGroupLastMessage | null;
  receipts?: ApiReceipts | null;
  permissions?: ApiGroupPermissions | null;
  createdAt: string;
}

export interface ApiGroupInboxEntry {
  group?: { id: string } | null;
  lastMessage?: ApiGroupLastMessage | null;
  unreadCount?: number;
  receipts?: ApiReceipts | null;
}

export interface ApiCommunityGroupsResponse {
  items: ApiCommunityGroup[];
  nextCursor?: string | null;
  canCreateGroup?: boolean;
}

export interface ApiGroupMember {
  user: ApiPerson;
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

export interface ApiGroupMembershipResponse {
  role: 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

const JOIN_POLICY_MAP: Record<NonNullable<ApiCommunityGroup['joinPolicy']>, GroupJoinPolicy> = {
  OPEN: 'open',
  APPROVAL: 'approval',
  INVITE_ONLY: 'invite-only',
};

const MEMBERSHIP_MAP: Record<'NONE' | 'ACTIVE' | 'REQUESTED', GroupMembershipStatus> = {
  NONE: 'none',
  ACTIVE: 'member',
  REQUESTED: 'pending',
};

const ROLE_MAP: Record<NonNullable<ApiCommunityGroup['role']>, GroupRole> = {
  ADMIN: 'admin',
  MEMBER: 'member',
};

const API_ROLE_MAP: Record<GroupRole, ApiGroupMember['role']> = {
  admin: 'ADMIN',
  member: 'MEMBER',
};

function toPermissions(
  p: ApiGroupPermissions | null | undefined,
  fallback: { membership: GroupMembershipStatus; role: GroupRole | null; joinPolicy: GroupJoinPolicy; isDefault: boolean; archived: boolean },
): GroupPermissions {
  if (p) {
    return {
      canJoin: Boolean(p.canJoin),
      canLeave: Boolean(p.canLeave),
      canEdit: Boolean(p.canEdit),
      canDelete: Boolean(p.canDelete),
      canManageMembers: Boolean(p.canManageMembers),
      canSendMessages: Boolean(p.canSendMessages),
    };
  }
  const isMember = fallback.membership === 'member';
  const isGroupAdmin = isMember && fallback.role === 'admin';
  return {
    canJoin: !isMember && fallback.joinPolicy === 'open' && !fallback.archived,
    canLeave: isMember && !fallback.isDefault,
    canEdit: isGroupAdmin,
    canDelete: isGroupAdmin && !fallback.isDefault,
    canManageMembers: isGroupAdmin,
    canSendMessages: isMember && !fallback.archived,
  };
}

function toLastMessage(last: ApiGroupLastMessage | null | undefined): CommunityGroup['lastMessage'] {
  if (!last) return null;
  const deleted = Boolean(last.deletedAt);
  const rawKind = last.kind?.toUpperCase();
  const hasPhotoAttachment = !deleted && Boolean(last.attachments?.some((a) => a.kind?.toUpperCase() === 'IMAGE' || a.kind?.toUpperCase() === 'PHOTO'));
  const kind: NonNullable<CommunityGroup['lastMessage']>['kind'] =
    rawKind === 'IMAGE' || rawKind === 'PHOTO' || hasPhotoAttachment
      ? 'photo'
      : rawKind === 'LINK' || (!deleted && Boolean(last.link))
        ? 'link'
        : 'text';
  const isMine = Boolean(last.isMine);
  return {
    seq: last.seq ?? null,
    senderName: isMine ? 'You' : (last.sender?.displayName ?? last.senderName ?? 'Former member'),
    isMine,
    text: deleted ? 'Message deleted' : (last.text ?? ''),
    kind,
    sentAt: last.sentAt,
  };
}

export function toCommunityGroup(g: ApiCommunityGroup): CommunityGroup {
  const membershipObj = g.membership && typeof g.membership === 'object' ? g.membership : null;
  const membership: GroupMembershipStatus = membershipObj
    ? 'member'
    : typeof g.membership === 'string'
      ? (MEMBERSHIP_MAP[g.membership] ?? 'none')
      : 'none';
  const rawRole = membershipObj ? membershipObj.role : g.role;
  const joinPolicy: GroupJoinPolicy = g.joinPolicy
    ? (JOIN_POLICY_MAP[g.joinPolicy] ?? 'open')
    : g.visibility === 'PRIVATE'
      ? 'invite-only'
      : 'open';
  const role = rawRole ? (ROLE_MAP[rawRole] ?? 'member') : null;
  const isDefault = Boolean(g.isDefault);
  const archived = g.status === 'ARCHIVED';
  return {
    id: g.id,
    communityId: g.communityId,
    name: g.name,
    description: g.description ?? '',
    monogram: monogramFor(g.name),
    photoUrl: g.avatarUrl ?? g.iconUrl ?? null,
    iconName: g.iconName ?? null,
    memberCount: g.memberCount,
    joinPolicy,
    membership,
    role,
    unreadCount: g.unreadCount ?? 0,
    isMuted: Boolean(g.isMuted),
    isDefault,
    lastMessage: toLastMessage(g.lastMessage),
    receipts: toReceipts(g.receipts),
    permissions: toPermissions(g.permissions, { membership, role, joinPolicy, isDefault, archived }),
    createdAt: g.createdAt,
  };
}

function toGroupMember(m: ApiGroupMember): CommunityGroupMember {
  return {
    username: m.user.username,
    displayName: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
    role: ROLE_MAP[m.role] ?? 'member',
    joinedAt: m.joinedAt,
  };
}

function toGroupBody(input: Partial<CommunityGroupInput>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.joinPolicy !== undefined ? { visibility: input.joinPolicy === 'invite-only' ? 'PRIVATE' : 'PUBLIC' } : {}),
    ...(input.avatarKey !== undefined ? { iconKey: input.avatarKey } : {}),
  };
}

async function groupsRoute<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) throw unsupported('Community groups');
    throw error;
  }
}

export function createHttpGroupsApi(client: HttpClient): KinnocApi['groups'] {
  const getGroup = async (communityId: string, groupId: string) =>
    toCommunityGroup(await groupsRoute(() => client.get<ApiCommunityGroup>(GROUP_ROUTES.get(communityId, groupId))));

  return {
    list: async (communityId): Promise<CommunityGroupsList> => {
      const [res, inboxEntries] = await Promise.all([
        groupsRoute(() => client.get<ApiCommunityGroupsResponse>(GROUP_ROUTES.list(communityId))),
        client.get<ApiGroupInboxEntry[]>(GROUP_ROUTES.inbox, { query: { scope: 'groups' } }).catch(() => []),
      ]);
      const inboxByGroup = new Map<string, ApiGroupInboxEntry>();
      for (const entry of inboxEntries) {
        if (entry.group?.id) inboxByGroup.set(entry.group.id, entry);
      }
      return {
        items: res.items.map((item) => {
          const inbox = inboxByGroup.get(item.id);
          return toCommunityGroup({
            ...item,
            lastMessage: item.lastMessage ?? inbox?.lastMessage ?? null,
            unreadCount: item.unreadCount ?? inbox?.unreadCount ?? 0,
            receipts: item.receipts ?? inbox?.receipts ?? null,
          });
        }),
        canCreateGroup: Boolean(res.canCreateGroup),
      };
    },
    get: getGroup,
    create: async (communityId, input) =>
      toCommunityGroup(
        await groupsRoute(() => client.post<ApiCommunityGroup>(GROUP_ROUTES.list(communityId), { body: toGroupBody(input) })),
      ),
    update: async (communityId, groupId, changes) =>
      toCommunityGroup(
        await groupsRoute(() =>
          client.patch<ApiCommunityGroup>(GROUP_ROUTES.get(communityId, groupId), { body: toGroupBody(changes) }),
        ),
      ),
    remove: async (communityId, groupId) => {
      await groupsRoute(() => client.delete(GROUP_ROUTES.get(communityId, groupId)));
    },
    join: async (communityId, groupId) => {
      const res = await groupsRoute(() =>
        client.post<ApiCommunityGroup | ApiGroupMembershipResponse>(GROUP_ROUTES.join(communityId, groupId)),
      );
      if ('id' in res) return toCommunityGroup(res);
      return getGroup(communityId, groupId);
    },
    leave: async (communityId, groupId) => {
      await groupsRoute(() => client.post(GROUP_ROUTES.leave(communityId, groupId)));
    },
    members: async (communityId, groupId, cursor) =>
      mapPage(
        await groupsRoute(() => client.get<Page<ApiGroupMember>>(GROUP_ROUTES.members(communityId, groupId), { query: { cursor } })),
        toGroupMember,
      ),
    addMember: async (communityId, groupId, username, role) =>
      toGroupMember(
        await groupsRoute(() =>
          client.post<ApiGroupMember>(GROUP_ROUTES.members(communityId, groupId), {
            body: { username, ...(role ? { role: API_ROLE_MAP[role] } : {}) },
          }),
        ),
      ),
    setMemberRole: async (communityId, groupId, username, role) =>
      toGroupMember(
        await groupsRoute(() =>
          client.patch<ApiGroupMember>(GROUP_ROUTES.member(communityId, groupId, username), {
            body: { role: API_ROLE_MAP[role] },
          }),
        ),
      ),
    removeMember: async (communityId, groupId, username) => {
      await groupsRoute(() => client.delete(GROUP_ROUTES.member(communityId, groupId, username)));
    },
    markRead: async (communityId, groupId, lastMessageId) => {
      await groupsRoute(() => client.post(GROUP_ROUTES.read(communityId, groupId), { body: { lastMessageId } }));
    },
    setMuted: async () => {
      throw unsupported('Group mute');
    },
    messages: async (communityId, groupId, cursor) =>
      toMessagePage(
        await groupsRoute(() => client.get<ApiMessagePage>(GROUP_ROUTES.messages(communityId, groupId), { query: { cursor } })),
      ),
    messagesSince: async (communityId, groupId, seq) =>
      toMessagePage(
        await groupsRoute(() => client.get<ApiMessagePage>(GROUP_ROUTES.messages(communityId, groupId), { query: { after: seq } })),
      ),
    sendMessage: async (communityId, groupId, input) => {
      if ((input.attachmentUris ?? []).length > 0) {
        throw unsupported('Message attachments');
      }
      return toMessage(
        await groupsRoute(() =>
          client.post<ApiMessage>(GROUP_ROUTES.messages(communityId, groupId), {
            body: {
              clientId: input.clientId,
              text: input.text,
              ...(input.replyToId ? { replyToId: input.replyToId } : {}),
            },
          }),
        ),
      );
    },
    removeMessage: async (communityId, groupId, messageId) => {
      await groupsRoute(() => client.delete(GROUP_ROUTES.message(communityId, groupId, messageId)));
    },
  };
}
