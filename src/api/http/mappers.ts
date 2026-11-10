/**
 * Kinnoc API payloads (see kinnoc-api docs/api-contract.md, docs/communities.md and docs/chat.md) and their mapping to
 * the app's domain types. Every field is mapped explicitly, so a field the API adds later never
 * leaks into screens by accident.
 */
import type {
  Account,
  AppNotification,
  Comment,
  Community,
  CommunityInput,
  CommunityMember,
  CommunityRole,
  CommunityVisibility,
  EventItem,
  FeedbackAttachment,
  FeedbackCategory,
  FeedbackDetail,
  FeedbackDevice,
  FeedbackInput,
  FeedbackStatus,
  FeedbackSummary,
  InboxEntry,
  Invitation,
  InvitationPreview,
  JoinPolicy,
  JoinRequest,
  MembershipStatus,
  Message,
  MessagePage,
  NotificationKind,
  NotificationPreferences,
  OwnVerification,
  Page,
  Person,
  Post,
  Profile,
  Receipts,
  UserSummary,
  Verification,
  VerificationCategory,
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

export interface ApiReceipts {
  deliveredSeq: number;
  readSeq: number;
}

export interface ApiMessagePage extends Page<ApiMessage> {
  /** Absent from APIs older than Delivered and Seen receipts. */
  receipts?: ApiReceipts | null;
}

export interface ApiInboxEntry {
  community: ApiCommunity;
  lastMessage: ApiMessage | null;
  unreadCount: number;
  receipts?: ApiReceipts | null;
}

export interface ApiPost {
  id: string;
  author: ApiPerson;
  community: { id: string; slug: string; name: string } | null;
  text: string;
  media: { url: string; mimeType: string; width: number | null; height: number | null; alt: string | null }[];
  link: { url: string; domain: string } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  isMine: boolean;
  createdAt: string;
  editedAt: string | null;
}

export interface ApiComment {
  id: string;
  postId: string;
  parentId: string | null;
  /** Null once deleted. */
  author: ApiPerson | null;
  text: string | null;
  isMine: boolean;
  replyCount: number;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
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
  code?: string;
  inviteUrl?: string;
}

/** `GET /invites/:code`. */
export interface ApiInvitationPreview {
  code: string;
  expiresAt: string;
  community: {
    id: string;
    name: string;
    slug: string;
    description: string;
    avatarUrl: string | null;
    coverUrl: string | null;
    visibility: ApiCommunity['visibility'];
  };
  invitedBy: (ApiPerson & { id?: string }) | null;
}

export interface ApiAccount {
  id: string;
  email: string | null;
  profile: {
    username: string;
    displayName: string;
    bio: string | null;
    /** Object key in the avatars bucket; only returned for your own account. */
    avatarKey?: string | null;
    avatarUrl: string | null;
  } | null;
  interests: { slug: string; name: string }[];
  status?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
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
    // The server has it. Delivered and Seen come from the conversation's receipts.
    status: 'sent',
  };
}

const isSeq = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Receipt positions, or null when the API sent none (or something unusable). */
export function toReceipts(r: ApiReceipts | null | undefined): Receipts | null {
  if (!r || !isSeq(r.deliveredSeq) || !isSeq(r.readSeq)) return null;
  return { deliveredSeq: r.deliveredSeq, readSeq: r.readSeq };
}

export const toMessagePage = (page: ApiMessagePage): MessagePage => ({ ...mapPage(page, toMessage), receipts: toReceipts(page.receipts) });

export function toInboxEntry(e: ApiInboxEntry): InboxEntry {
  const m = e.lastMessage;
  return {
    community: toCommunity(e.community),
    lastMessage: m
      ? {
          seq: m.seq,
          senderName: m.isMine ? 'You' : (m.sender?.displayName.split(' ')[0] ?? 'Former member'),
          isMine: m.isMine,
          text: m.text ?? '',
          kind: 'text',
          sentAt: m.sentAt,
        }
      : null,
    unreadCount: e.unreadCount,
    receipts: toReceipts(e.receipts),
    // Not provided by the API yet.
    hasMention: false,
    isPinned: false,
    isMuted: false,
    typing: [],
  };
}

/**
 * People in the feed. The API never exposes user IDs, so the username (unique) stands in as the
 * ID; it is used for list keys only.
 */
export const toUserSummary = (p: ApiPerson): UserSummary => ({ id: p.username, ...toPerson(p) });

export function toPost(p: ApiPost): Post {
  return {
    kind: 'post',
    id: p.id,
    author: toUserSummary(p.author),
    community: p.community ? { id: p.community.id, name: p.community.name } : null,
    text: p.text,
    media: p.media.map((m) => ({
      // Each image appears once per post, so its URL identifies it.
      id: m.url,
      kind: 'image',
      url: m.url,
      // 0 = size unknown (the uploader did not send one).
      width: m.width ?? 0,
      height: m.height ?? 0,
      alt: m.alt ?? undefined,
    })),
    link: p.link ? { url: p.link.url, domain: p.link.domain } : null,
    createdAt: p.createdAt,
    editedAt: p.editedAt,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    likedByMe: p.likedByMe,
    isMine: p.isMine,
    // Saved posts and reply previews are not part of the API yet.
    savedByMe: false,
    topReply: null,
  };
}

export const toComment = (c: ApiComment): Comment => ({
  id: c.id,
  postId: c.postId,
  parentId: c.parentId,
  author: c.author ? toUserSummary(c.author) : null,
  text: c.text ?? '',
  isMine: c.isMine,
  replyCount: c.replyCount,
  createdAt: c.createdAt,
  editedAt: c.editedAt,
  deletedAt: c.deletedAt,
});

export const toMember = (m: ApiMember): CommunityMember => ({ ...toPerson(m), role: ROLE[m.role], joinedAt: m.joinedAt });

export const toJoinRequest = (r: ApiJoinRequest): JoinRequest => ({ user: toPerson(r.user), requestedAt: r.requestedAt });

export const toInvitation = (i: ApiInvitation): Invitation => ({
  user: toPerson(i.user),
  invitedBy: i.invitedBy ? toPerson(i.invitedBy) : null,
  invitedAt: i.invitedAt,
  code: i.code ?? null,
});

export const toInvitationPreview = (p: ApiInvitationPreview): InvitationPreview => ({
  code: p.code,
  expiresAt: p.expiresAt,
  community: {
    id: p.community.id,
    slug: p.community.slug,
    name: p.community.name,
    monogram: monogramFor(p.community.name),
    description: p.community.description,
    photoUrl: p.community.avatarUrl,
    coverUrl: p.community.coverUrl,
    visibility: VISIBILITY[p.community.visibility],
  },
  // The API also sends the inviter's user ID; the app never keeps user IDs of other people.
  invitedBy: p.invitedBy ? toPerson(p.invitedBy) : null,
});

/**
 * `POST /users/provision` answers even for suspended and deactivated accounts (it skips the API's
 * account check), so their status arrives here rather than as a 403, and the app must act on it.
 */
const ACCOUNT_STATUS = { ACTIVE: 'active', SUSPENDED: 'suspended', DEACTIVATED: 'deactivated' } as const;

export const toAccount = (a: ApiAccount): Account => ({
  id: a.id,
  email: a.email,
  profile: a.profile ? { username: a.profile.username, displayName: a.profile.displayName } : null,
  // An older API without the field means active, as before.
  status: a.status && a.status in ACCOUNT_STATUS ? ACCOUNT_STATUS[a.status] : 'active',
});

/**
 * `GET /profiles/:username`: another person's profile as the caller may see it. The API never
 * returns their email, role, status or user ID. `interests` is null when they keep it private.
 */
export interface ApiPublicProfile {
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  interests: { slug: string; name: string }[] | null;
}

export function toPublicProfile(p: ApiPublicProfile): Profile {
  const interests = Array.isArray(p.interests) ? p.interests : [];
  return {
    // The API exposes no user IDs; the username identifies people in the app.
    id: p.username,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl ?? null,
    bio: p.bio ?? null,
    headline: null,
    location: null,
    website: null,
    interests: interests.map((i) => i.name),
    interestSlugs: interests.map((i) => i.slug),
    followerCount: 0,
    followingCount: 0,
    communityCount: 0,
    isMe: false,
    isFollowing: false,
  };
}

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
    interestSlugs: a.interests.map((i) => i.slug),
    followerCount: 0,
    followingCount: 0,
    communityCount,
    isMe: true,
    isFollowing: false,
  };
}

export const mapPage = <A, B>(page: Page<A>, fn: (a: A) => B): Page<B> => ({ items: page.items.map(fn), nextCursor: page.nextCursor });

/** A public event (kinnoc-api docs/events.md). Drafts and archived events never reach the app. */
export interface ApiEvent {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  coverImageUrl: string | null;
  organizerName: string;
  organizerLogoUrl: string | null;
  category: string;
  tags: string[];
  startAt: string;
  endAt: string | null;
  timezone: string;
  isOnline: boolean;
  venueName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  onlineEventUrl: string | null;
  registrationUrl: string | null;
  registrationDeadline: string | null;
  capacity: number | null;
  priceAmount: number | null;
  currency: string | null;
  status: 'PUBLISHED' | 'CANCELLED';
  isPast: boolean;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const isInstant = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const httpsUrl = (v: unknown) => (typeof v === 'string' && /^https:\/\//i.test(v) ? v : null);
const join = (parts: unknown[]) => parts.map(text).filter(Boolean).join(', ') || null;

/** "CAREER" → "Career". */
const categoryLabel = (c: unknown) => {
  const t = text(c);
  return t ? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ') : null;
};

/**
 * Maps an event, or returns null when the payload lacks what a screen needs (an ID, a title and a
 * valid start), so one malformed record cannot break a list. Optional fields degrade to null.
 */
export function toEvent(e: ApiEvent): EventItem | null {
  if (!e || typeof e !== 'object' || !text(e.id) || !text(e.title) || !isInstant(e.startAt)) return null;
  const isOnline = e.isOnline === true;
  const amount = typeof e.priceAmount === 'number' && e.priceAmount >= 0 ? e.priceAmount : null;
  const currency = text(e.currency);
  return {
    kind: 'event',
    id: e.id,
    title: e.title.trim(),
    summary: text(e.summary) ?? '',
    description: text(e.description),
    coverUrl: httpsUrl(e.coverImageUrl),
    // Saving events is not part of the API yet.
    savedByMe: false,
    externalUrl: httpsUrl(e.registrationUrl),
    startsAt: e.startAt,
    endsAt: isInstant(e.endAt) ? e.endAt : null,
    timeZone: text(e.timezone),
    venue: isOnline ? 'Online' : (join([e.venueName, e.city]) ?? 'Venue to be announced'),
    address: isOnline ? null : join([e.address, e.city, e.state, e.country]),
    isOnline,
    onlineUrl: isOnline ? httpsUrl(e.onlineEventUrl) : null,
    host: text(e.organizerName) ?? 'Kinnoc',
    hostLogoUrl: httpsUrl(e.organizerLogoUrl),
    category: categoryLabel(e.category),
    tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string' && !!t) : [],
    price: amount !== null && currency ? { amount, currency } : null,
    capacity: typeof e.capacity === 'number' && e.capacity > 0 ? e.capacity : null,
    registrationDeadline: isInstant(e.registrationDeadline) ? e.registrationDeadline : null,
    status: e.status === 'CANCELLED' ? 'cancelled' : 'scheduled',
    cancellationReason: text(e.cancellationReason),
    isPast: e.isPast === true,
  };
}

/** A page of events without the records that could not be mapped. */
export function toEventPage(page: Page<ApiEvent>): Page<EventItem> {
  const items = Array.isArray(page?.items) ? page.items : [];
  return { items: items.map(toEvent).filter((e): e is EventItem => e !== null), nextCursor: typeof page?.nextCursor === 'string' ? page.nextCursor : null };
}

/** `GET /profiles/:username/verification` (kinnoc-api docs/verification.md). */
export interface ApiVerification {
  isVerified: boolean;
  status: 'ACTIVE' | 'NONE';
  category: string | null;
  organisation: string | null;
  position: string | null;
  verifiedAt: string | null;
}

/** `GET /users/me/verification`: the owner also sees expired and revoked records. */
export interface ApiOwnVerification extends Omit<ApiVerification, 'status'> {
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'NONE';
  expiresAt: string | null;
}

const CATEGORY: Record<string, VerificationCategory> = {
  FOUNDER: 'founder',
  STUDENT_LEADER: 'student-leader',
  COMMUNITY_LEADER: 'community-leader',
  ORGANISATION_REPRESENTATIVE: 'organisation-representative',
  OTHER: 'other',
};

export const NOT_VERIFIED: Verification = { isVerified: false, category: null, organisation: null, position: null, verifiedAt: null };

/**
 * The API decides who is verified. A badge needs both of its signals, `isVerified` and an ACTIVE
 * status, so a malformed or contradictory answer never shows one. Details are kept only for an
 * active verification.
 */
export function toVerification(v: ApiVerification | null | undefined): Verification {
  if (!v || v.isVerified !== true || v.status !== 'ACTIVE') return NOT_VERIFIED;
  return {
    isVerified: true,
    category: typeof v.category === 'string' ? (CATEGORY[v.category] ?? 'other') : null,
    organisation: text(v.organisation),
    position: text(v.position),
    verifiedAt: isInstant(v.verifiedAt) ? v.verifiedAt : null,
  };
}

const OWN_STATUS = { ACTIVE: 'active', EXPIRED: 'expired', REVOKED: 'revoked', NONE: 'none' } as const;

export function toOwnVerification(v: ApiOwnVerification | null | undefined): OwnVerification {
  const status = v && v.status in OWN_STATUS ? OWN_STATUS[v.status] : 'none';
  const active = !!v && v.isVerified === true && status === 'active';
  return {
    isVerified: active,
    status,
    // The owner keeps the details of an expired or revoked record, to know what lapsed.
    category: v && typeof v.category === 'string' ? (CATEGORY[v.category] ?? 'other') : null,
    organisation: text(v?.organisation),
    position: text(v?.position),
    verifiedAt: isInstant(v?.verifiedAt) ? v.verifiedAt : null,
    expiresAt: isInstant(v?.expiresAt) ? v.expiresAt : null,
  };
}

export interface ApiNotificationActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ApiNotification {
  id: string;
  recipientId: string;
  actorId: string | null;
  actor: ApiNotificationActor | null;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  targetUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ApiNotificationPreferences {
  inAppDirectMessages: boolean;
  inAppLikes: boolean;
  inAppComments: boolean;
  inAppFollows: boolean;
  inAppMentions: boolean;
  inAppInvitations: boolean;
  inAppAnnouncements: boolean;
  inAppVerifications: boolean;
  inAppSystem: boolean;

  pushEnabled: boolean;
  pushDirectMessages: boolean;
  pushLikes: boolean;
  pushComments: boolean;
  pushFollows: boolean;
  pushMentions: boolean;
  pushInvitations: boolean;
  pushAnnouncements: boolean;
  pushVerifications: boolean;
  pushSystem: boolean;
}

const TYPE_TO_KIND: Record<string, NotificationKind> = {
  POST_LIKE: 'like',
  POST_COMMENT: 'reply',
  COMMENT_REPLY: 'reply',
  USER_MENTION: 'mention',
  USER_FOLLOW: 'mention',
  DIRECT_MESSAGE: 'message',
  COMMUNITY_INVITATION: 'community',
  COMMUNITY_JOIN_REQUEST: 'community',
  COMMUNITY_ANNOUNCEMENT: 'community',
  VERIFICATION_APPROVED: 'verification',
  VERIFICATION_REVOKED: 'verification',
  FEEDBACK_RESPONSE: 'feedback',
  SYSTEM: 'system',
};

export function toNotification(n: ApiNotification): AppNotification {
  const kind = TYPE_TO_KIND[n.type] ?? 'system';
  const actor = n.actor
    ? {
        id: n.actor.id,
        username: n.actor.username,
        displayName: n.actor.displayName,
        avatarUrl: n.actor.avatarUrl,
      }
    : null;

  let titleSegments: { text: string; strong?: boolean }[];
  if (actor) {
    titleSegments = [
      { text: actor.displayName, strong: true },
      { text: ` ${n.title.toLowerCase()}` },
    ];
  } else {
    titleSegments = [{ text: n.title, strong: true }];
  }

  return {
    id: n.id,
    kind,
    actor,
    title: titleSegments,
    excerpt: n.body || null,
    createdAt: n.createdAt,
    read: n.isRead,
    target: n.targetUrl,
  };
}

export function toNotificationPreferences(p: ApiNotificationPreferences): NotificationPreferences {
  return {
    mentions: p.inAppMentions ?? true,
    replies: p.inAppComments ?? true,
    likes: p.inAppLikes ?? true,
    communityActivity: p.inAppInvitations ?? true,
    reminders: p.inAppAnnouncements ?? true,
    directMessages: p.inAppDirectMessages ?? true,
    verifications: p.inAppVerifications ?? true,
    system: p.inAppSystem ?? true,

    pushEnabled: p.pushEnabled ?? true,
    pushDirectMessages: p.pushDirectMessages ?? true,
    pushLikes: p.pushLikes ?? true,
    pushComments: p.pushComments ?? true,
    pushMentions: p.pushMentions ?? true,
    pushInvitations: p.pushInvitations ?? true,
    pushAnnouncements: p.pushAnnouncements ?? true,
    pushVerifications: p.pushVerifications ?? true,
    pushSystem: p.pushSystem ?? true,
  };
}

export function toApiNotificationPreferences(p: NotificationPreferences): Partial<ApiNotificationPreferences> {
  return {
    inAppMentions: p.mentions,
    inAppComments: p.replies,
    inAppLikes: p.likes,
    inAppInvitations: p.communityActivity,
    inAppAnnouncements: p.reminders,
    inAppDirectMessages: p.directMessages,
    inAppVerifications: p.verifications,
    inAppSystem: p.system,

    pushEnabled: p.pushEnabled,
    pushDirectMessages: p.pushDirectMessages,
    pushLikes: p.pushLikes,
    pushComments: p.pushComments,
    pushMentions: p.pushMentions,
    pushInvitations: p.pushInvitations,
    pushAnnouncements: p.pushAnnouncements,
    pushVerifications: p.pushVerifications,
    pushSystem: p.pushSystem,
  };
}

/* ---------- Feedback ---------- */

export type ApiFeedbackCategory = 'GENERAL' | 'BUG_REPORT' | 'FEATURE_REQUEST' | 'USER_EXPERIENCE';
export type ApiFeedbackStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type ApiFeedbackPlatform = 'IOS' | 'ANDROID' | 'WEB' | 'OTHER';

/** A submission in the caller's list (`GET /users/me/feedback`). */
export interface ApiFeedbackSummary {
  id: string;
  category: ApiFeedbackCategory;
  subject: string;
  status: ApiFeedbackStatus;
  createdAt: string;
  updatedAt: string;
  responseCount?: number;
}

export interface ApiFeedbackAttachment {
  position?: number;
  /** Object path in the feedback bucket. The schema calls it `storageKey`; either name is read. */
  key?: string;
  storageKey?: string;
  mimeType: string;
  sizeBytes: number;
  /** A signed URL, if the API provides one. Otherwise the app signs the key itself. */
  url?: string | null;
}

/** A submission as its sender may see it (`GET /feedback/:id`, `POST /feedback`). */
export interface ApiFeedback extends ApiFeedbackSummary {
  description: string;
  appVersion?: string | null;
  platform?: ApiFeedbackPlatform | null;
  osVersion?: string | null;
  attachments?: ApiFeedbackAttachment[];
  responses?: { id: string; body: string; createdAt: string }[];
}

const FEEDBACK_CATEGORY: Record<ApiFeedbackCategory, FeedbackCategory> = {
  GENERAL: 'general',
  BUG_REPORT: 'bug',
  FEATURE_REQUEST: 'feature',
  USER_EXPERIENCE: 'experience',
};
export const toApiFeedbackCategory: Record<FeedbackCategory, ApiFeedbackCategory> = {
  general: 'GENERAL',
  bug: 'BUG_REPORT',
  feature: 'FEATURE_REQUEST',
  experience: 'USER_EXPERIENCE',
};
const FEEDBACK_STATUS: Record<ApiFeedbackStatus, FeedbackStatus> = {
  RECEIVED: 'received',
  UNDER_REVIEW: 'under-review',
  IN_PROGRESS: 'in-progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};
const FEEDBACK_PLATFORM: Record<ApiFeedbackPlatform, FeedbackDevice['platform']> = { IOS: 'ios', ANDROID: 'android', WEB: 'web', OTHER: 'other' };
const toApiPlatform: Record<FeedbackDevice['platform'], ApiFeedbackPlatform> = { ios: 'IOS', android: 'ANDROID', web: 'WEB', other: 'OTHER' };

export function toFeedbackSummary(f: ApiFeedbackSummary): FeedbackSummary {
  return {
    id: f.id,
    // A category or status added on the server later reads as the most neutral one.
    category: FEEDBACK_CATEGORY[f.category] ?? 'general',
    subject: f.subject,
    status: FEEDBACK_STATUS[f.status] ?? 'received',
    createdAt: f.createdAt,
    updatedAt: f.updatedAt ?? f.createdAt,
    responseCount: f.responseCount ?? (f as ApiFeedback).responses?.length ?? 0,
  };
}

/**
 * Field by field on purpose: whatever else the payload carries (internal notes, the assignee,
 * the activity log, an administrator's identity on a reply) never reaches the app.
 */
export function toFeedbackDetail(f: ApiFeedback): FeedbackDetail {
  const device: FeedbackDevice | null =
    f.platform || f.appVersion || f.osVersion
      ? { appVersion: f.appVersion ?? null, platform: f.platform ? (FEEDBACK_PLATFORM[f.platform] ?? 'other') : 'other', osVersion: f.osVersion ?? null }
      : null;
  const attachments: FeedbackAttachment[] = [...(f.attachments ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((a) => ({ key: a.key ?? a.storageKey ?? '', mimeType: a.mimeType, sizeBytes: a.sizeBytes, url: a.url ?? null }))
    .filter((a) => a.key);
  const responses = [...(f.responses ?? [])]
    .map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return { ...toFeedbackSummary(f), responseCount: responses.length, description: f.description, device, attachments, responses };
}

/**
 * `POST /feedback` body. Device fields are sent only when the app has them. Attachments are sent
 * as `{ key }` only: the API rejects any other field, and reads each file's owner, type and size
 * from Supabase Storage itself rather than trusting the client.
 */
export function toFeedbackBody(input: FeedbackInput) {
  return {
    clientId: input.clientId,
    category: toApiFeedbackCategory[input.category],
    subject: input.subject,
    description: input.description,
    ...(input.attachments.length ? { attachments: input.attachments.map(({ key }) => ({ key })) } : {}),
    ...(input.device
      ? {
          platform: toApiPlatform[input.device.platform],
          ...(input.device.appVersion ? { appVersion: input.device.appVersion } : {}),
          ...(input.device.osVersion ? { osVersion: input.device.osVersion } : {}),
        }
      : {}),
  };
}
