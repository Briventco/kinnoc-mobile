/**
 * Kinnoc API payloads (see kinnoc-api docs/communities.md and docs/chat.md) and their mapping to
 * the app's domain types. Every field is mapped explicitly, so a field the API adds later never
 * leaks into screens by accident.
 */
import type {
  Account,
  Community,
  CommunityInput,
  CommunityMember,
  CommunityRole,
  CommunityVisibility,
  InboxEntry,
  Invitation,
  JoinPolicy,
  JoinRequest,
  MembershipStatus,
  Message,
  Page,
  Person,
  Profile,
} from '../types';

type ApiVisibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
type ApiJoinPolicy = 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';
type ApiMembershipStatus = 'ACTIVE' | 'REQUESTED' | 'INVITED';
type ApiRole = 'OWNER' | 'MODERATOR' | 'MEMBER';

export interface ApiPerson {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ApiCommunity {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { slug: string; name: string };
  avatarUrl: string | null;
  coverUrl: string | null;
  visibility: ApiVisibility;
  joinPolicy: ApiJoinPolicy;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  membership: { status: ApiMembershipStatus; role: ApiRole | null; joinedAt: string | null } | null;
}

export interface ApiMessage {
  id: string;
  communityId: string;
  seq: number;
  clientId: string | null;
  sender: ApiPerson | null;
  isMine: boolean;
  text: string | null;
  replyTo: { id: string; senderName: string | null; text: string | null } | null;
  sentAt: string;
  deletedAt: string | null;
}

export interface ApiInboxEntry {
  community: ApiCommunity;
  lastMessage: ApiMessage | null;
  unreadCount: number;
}

export interface ApiMember extends ApiPerson {
  role: ApiRole;
  joinedAt: string;
}

export interface ApiJoinRequest {
  user: ApiPerson;
  requestedAt: string;
}

export interface ApiInvitation {
  user: ApiPerson;
  invitedBy: ApiPerson | null;
  invitedAt: string;
}

export interface ApiAccount {
  id: string;
  email: string | null;
  profile: {
    username: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
  } | null;
  interests: { slug: string; name: string }[];
}

const VISIBILITY: Record<ApiVisibility, CommunityVisibility> = { PUBLIC: 'public', UNLISTED: 'unlisted', PRIVATE: 'private' };
const JOIN_POLICY: Record<ApiJoinPolicy, JoinPolicy> = { OPEN: 'open', APPROVAL: 'approval', INVITE_ONLY: 'invite-only' };
const MEMBERSHIP: Record<ApiMembershipStatus, MembershipStatus> = { ACTIVE: 'member', REQUESTED: 'pending', INVITED: 'invited' };
const ROLE: Record<ApiRole, CommunityRole> = { OWNER: 'owner', MODERATOR: 'moderator', MEMBER: 'member' };

const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as Record<V, K>;

export const toApiVisibility = invert(VISIBILITY);
export const toApiJoinPolicy = invert(JOIN_POLICY);
export const toApiRole = invert(ROLE);
export const toApiMembership = invert(MEMBERSHIP);

/** Up to two initials from the name, for communities without a photo. */
export function monogramFor(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => [...w.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '');
  return letters.join('').toUpperCase() || '#';
}

export function toCommunity(c: ApiCommunity): Community {
  const active = c.membership?.status === 'ACTIVE';
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    monogram: monogramFor(c.name),
    photoUrl: c.avatarUrl,
    coverUrl: c.coverUrl,
    memberCount: c.memberCount,
    category: c.category.name,
    categorySlug: c.category.slug,
    visibility: VISIBILITY[c.visibility],
    joinPolicy: JOIN_POLICY[c.joinPolicy],
    description: c.description,
    membership: c.membership ? MEMBERSHIP[c.membership.status] : 'none',
    role: active && c.membership?.role ? ROLE[c.membership.role] : null,
    // Pinned posts and rules are not part of the API yet.
    pinned: null,
    rules: [],
  };
}

export function toCommunityBody(input: Partial<CommunityInput>) {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.category !== undefined) body.category = input.category;
  if (input.visibility !== undefined) body.visibility = toApiVisibility[input.visibility];
  if (input.joinPolicy !== undefined) body.joinPolicy = toApiJoinPolicy[input.joinPolicy];
  if (input.avatarKey !== undefined) body.avatarKey = input.avatarKey;
  if (input.coverKey !== undefined) body.coverKey = input.coverKey;
  return body;
}

export const toPerson = (p: ApiPerson): Person => ({ username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl });

export function toMessage(m: ApiMessage): Message {
  return {
    id: m.id,
    clientId: m.clientId,
    communityId: m.communityId,
    seq: m.seq,
    sender: m.sender ? toPerson(m.sender) : null,
    isMine: m.isMine,
    text: m.text ?? '',
    sentAt: m.sentAt,
    deletedAt: m.deletedAt,
    replyTo: m.replyTo
      ? { id: m.replyTo.id, senderName: m.replyTo.senderName ?? 'Former member', text: m.replyTo.text ?? 'Deleted message' }
      : null,
    attachments: [],
    link: null,
    reactions: [],
    // The server has the message, so it is sent. The API has no read receipts for others.
    status: 'sent',
  };
}

export function toInboxEntry(e: ApiInboxEntry): InboxEntry {
  const m = e.lastMessage;
  return {
    community: toCommunity(e.community),
    lastMessage: m
      ? {
          senderName: m.isMine ? 'You' : (m.sender?.displayName.split(' ')[0] ?? 'Former member'),
          isMine: m.isMine,
          text: m.text ?? '',
          kind: 'text',
          sentAt: m.sentAt,
        }
      : null,
    unreadCount: e.unreadCount,
    // Not provided by the API yet.
    hasMention: false,
    isPinned: false,
    isMuted: false,
    typing: [],
  };
}

export const toMember = (m: ApiMember): CommunityMember => ({ ...toPerson(m), role: ROLE[m.role], joinedAt: m.joinedAt });

export const toJoinRequest = (r: ApiJoinRequest): JoinRequest => ({ user: toPerson(r.user), requestedAt: r.requestedAt });

export const toInvitation = (i: ApiInvitation): Invitation => ({
  user: toPerson(i.user),
  invitedBy: i.invitedBy ? toPerson(i.invitedBy) : null,
  invitedAt: i.invitedAt,
});

export const toAccount = (a: ApiAccount): Account => ({
  id: a.id,
  email: a.email,
  profile: a.profile ? { username: a.profile.username, displayName: a.profile.displayName } : null,
});

/** The signed-in person's profile. Follows, headline, location and website are not in the API yet. */
export function toOwnProfile(a: ApiAccount, communityCount: number): Profile {
  return {
    id: a.id,
    username: a.profile?.username ?? '',
    displayName: a.profile?.displayName ?? '',
    avatarUrl: a.profile?.avatarUrl ?? null,
    bio: a.profile?.bio ?? null,
    headline: null,
    location: null,
    website: null,
    interests: a.interests.map((i) => i.name),
    followerCount: 0,
    followingCount: 0,
    communityCount,
    isMe: true,
    isFollowing: false,
  };
}

export const mapPage = <A, B>(page: Page<A>, fn: (a: A) => B): Page<B> => ({ items: page.items.map(fn), nextCursor: page.nextCursor });
