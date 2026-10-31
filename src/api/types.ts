/**
 * Domain models shared by the API layer and the UI.
 * These mirror the payloads described in docs/api-contract.md. Dates are ISO-8601 strings.
 */

export type ID = string;
export type ISODate = string;

/** Cursor pagination used by every list endpoint. `nextCursor` is null on the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MediaAsset {
  id: ID;
  kind: 'image' | 'video';
  url: string;
  width: number;
  height: number;
  /** Short description for screen readers. */
  alt?: string;
}

export interface UserSummary {
  id: ID;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

export interface Profile extends UserSummary {
  headline: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  /** Interest names, as shown. */
  interests: string[];
  /** Their catalogue slugs, in the same order, where the backend has a catalogue (else empty). */
  interestSlugs: string[];
  followerCount: number;
  followingCount: number;
  communityCount: number;
  isMe: boolean;
  isFollowing: boolean;
}

/** Why someone was verified. Unknown values from a newer API read as `other`. */
export type VerificationCategory = 'founder' | 'student-leader' | 'community-leader' | 'organisation-representative' | 'other';

/**
 * Someone's verification as the public sees it (the blue tick). Only an active verification is
 * `isVerified`; revoked, expired and unverified people all look the same, by the API's design.
 */
export interface Verification {
  isVerified: boolean;
  category: VerificationCategory | null;
  organisation: string | null;
  position: string | null;
  verifiedAt: ISODate | null;
}

/** Your own verification: the owner also learns when it has expired or been revoked. */
export interface OwnVerification extends Verification {
  status: 'active' | 'expired' | 'revoked' | 'none';
  expiresAt: ISODate | null;
}

export interface ProfileUpdate {
  displayName: string;
  headline: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  interests: string[];
}

/** Public: listed in discovery. Unlisted: reachable by its link (the ID). Private: members and invitees only. */
export type CommunityVisibility = 'public' | 'unlisted' | 'private';
/** How someone who can see a community gets in. Private communities are always invite-only. */
export type JoinPolicy = 'open' | 'approval' | 'invite-only';
/** The viewer's relationship with a community. `pending` is a join request waiting for review. */
export type MembershipStatus = 'none' | 'member' | 'pending' | 'invited';
export type CommunityRole = 'owner' | 'moderator' | 'member';

/** A community category. Categories reuse the curated interest catalogue. */
export interface Category {
  slug: string;
  name: string;
}

/** Another person as shown in community lists and chat. User IDs are never exposed by the API. */
export interface Person {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommunitySummary {
  id: ID;
  /** Readable identifier; the API accepts it wherever it accepts the ID. */
  slug: string;
  name: string;
  /** Short monogram (1–2 letters) used when there is no photo. */
  monogram: string;
  photoUrl: string | null;
  memberCount: number;
  /** Category display name. */
  category: string;
  visibility: CommunityVisibility;
}

export interface Community extends CommunitySummary {
  description: string;
  categorySlug: string;
  coverUrl: string | null;
  joinPolicy: JoinPolicy;
  membership: MembershipStatus;
  /** The viewer's role; null unless they are a member. */
  role: CommunityRole | null;
  pinned: { title: string; body: string } | null;
  rules: string[];
}

/** Fields for creating a community; every field but `slug` can be changed later by the owner. */
export interface CommunityInput {
  name: string;
  description: string;
  /** Category slug. */
  category: string;
  visibility: CommunityVisibility;
  joinPolicy: JoinPolicy;
  /** Keys returned by `media.uploadCommunityImage`. Null removes the image on update. */
  avatarKey?: string | null;
  coverKey?: string | null;
}

export interface CommunityBrowseFilter {
  query: string;
  /** Category slug, or null for every category. */
  category: string | null;
}

export interface CommunityMember extends Person {
  role: CommunityRole;
  joinedAt: ISODate;
}

export interface JoinRequest {
  user: Person;
  requestedAt: ISODate;
}

export interface Invitation {
  user: Person;
  /** Null if the inviter's account no longer exists. */
  invitedBy: Person | null;
  invitedAt: ISODate;
}

/** An uploaded image: the storage key to send to the API and a URL to preview it. */
export interface UploadedImage {
  key: string;
  url: string;
}

/** One row of the Communities inbox: a community the viewer belongs to and its single conversation. */
export interface InboxEntry {
  community: CommunitySummary;
  lastMessage: {
    /** Position in the conversation, when the backend provides it. */
    seq?: number | null;
    senderName: string;
    isMine: boolean;
    text: string;
    kind: 'text' | 'photo' | 'link';
    sentAt: ISODate;
  } | null;
  unreadCount: number;
  /** Delivered and Seen positions of the conversation; null when the backend does not provide them. */
  receipts: Receipts | null;
  hasMention: boolean;
  isPinned: boolean;
  isMuted: boolean;
  /** Names of members typing now. Filled by the realtime channel. */
  typing: string[];
}

export interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface LinkPreview {
  url: string;
  title: string;
  domain: string;
  thumbnailUrl: string | null;
  /** e.g. "58 min" for a video. */
  detail: string | null;
  isVideo: boolean;
}

/**
 * For the viewer's own messages: `sent` (the server has it, one tick), `delivered` (every other
 * member's app has it, two grey ticks), `read` (every other member has read it: Seen).
 */
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * A conversation's aggregate receipt positions, across its other active members: every message
 * with `seq <= deliveredSeq` has reached everyone, every one with `seq <= readSeq` has been read
 * by everyone. Both are 0 while the community has fewer than two members. Individual members'
 * positions are never exposed.
 */
export interface Receipts {
  deliveredSeq: number;
  readSeq: number;
}

/** A page of conversation history with the receipt positions at the time it was fetched. */
export interface MessagePage extends Page<Message> {
  receipts: Receipts | null;
}

export interface Message {
  id: ID;
  /** Client-generated id used to reconcile optimistic sends with the server copy. */
  clientId: string | null;
  communityId: ID;
  /**
   * Position in the conversation (1, 2, 3… with no gaps, in commit order). Null until the server
   * has accepted the message.
   */
  seq: number | null;
  /** Null when the sender's account no longer exists. */
  sender: Person | null;
  isMine: boolean;
  /** Empty once deleted. */
  text: string;
  sentAt: ISODate;
  /** Set when the message was deleted; it keeps its place in the conversation. */
  deletedAt: ISODate | null;
  replyTo: { id: ID; senderName: string; text: string } | null;
  attachments: MediaAsset[];
  link: LinkPreview | null;
  reactions: Reaction[];
  /**
   * Only meaningful for the viewer's own messages. The server copy is `sent`; Delivered and Seen
   * come from the conversation's `Receipts` (see `deliveryStatus`).
   */
  status: DeliveryStatus;
}

export interface SendMessageInput {
  communityId: ID;
  clientId: string;
  text: string;
  replyToId: ID | null;
  /** Local file URIs chosen by the user; the API uploads them. */
  attachmentUris: string[];
}

/** A comment on a post, or a reply to one. Replies go one level deep. */
export interface Comment {
  id: ID;
  postId: ID;
  /** The top-level comment this replies to; null for a top-level comment. */
  parentId: ID | null;
  /** Null once deleted. */
  author: UserSummary | null;
  /** Empty once deleted. */
  text: string;
  isMine: boolean;
  /** Visible replies (top-level comments only). */
  replyCount: number;
  createdAt: ISODate;
  editedAt: ISODate | null;
  /** A deleted top-level comment stays listed, without its text, while it has replies. */
  deletedAt: ISODate | null;
}

export interface PostLink {
  url: string;
  /** Host name for display, e.g. `kinnoc.com`. */
  domain: string;
}

export interface Post {
  kind: 'post';
  id: ID;
  author: UserSummary;
  community: Pick<CommunitySummary, 'id' | 'name'> | null;
  text: string;
  media: MediaAsset[];
  link: PostLink | null;
  createdAt: ISODate;
  /** Set when the author changed the text or link. */
  editedAt: ISODate | null;
  likeCount: number;
  /** Comments and replies, not counting deleted ones. */
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  topReply: Comment | null;
  isMine: boolean;
}

/** A community announcement shown on a mist band in the Feed. */
export interface CommunityUpdate {
  kind: 'update';
  id: ID;
  community: CommunitySummary;
  title: string;
  body: string;
  startsAt: ISODate | null;
  place: string | null;
  createdAt: ISODate;
}

export type FeedItem = Post | CommunityUpdate;
export type FeedScope = 'for-you' | 'following' | 'communities';

/** An image uploaded for a post, with the size it was uploaded at. */
export interface PostImage extends UploadedImage {
  width: number;
  height: number;
}

export interface CreatePostInput {
  /**
   * Idempotency key: the same for every retry of one post, so a retry after a lost response
   * returns the original instead of a duplicate; new for a new post.
   */
  clientId: string;
  text: string;
  /** Null for the general feed. */
  communityId: ID | null;
  /** Up to four images, already uploaded with `media.uploadPostImage`, in order. */
  media: PostImage[];
  /** One absolute http(s) URL, or null. */
  link: string | null;
}

/** Author only. Media and community cannot change; a null link removes it. */
export interface PostUpdate {
  text?: string;
  link?: string | null;
}

export interface CommentInput {
  /** Idempotency key, as for posts. */
  clientId: string;
  text: string;
  /** A top-level comment of the same post, to reply to it. */
  parentId: ID | null;
}

export type OpportunityType = 'job' | 'internship' | 'scholarship' | 'hackathon' | 'programme';
export type ResourceFormat = 'guide' | 'video' | 'course' | 'template' | 'article';
export type WorkArrangement = 'remote' | 'onsite' | 'hybrid';

interface DiscoverBase {
  id: ID;
  title: string;
  summary: string;
  coverUrl: string | null;
  savedByMe: boolean;
  /** External page to apply, register or read. Opened in the system browser. */
  externalUrl: string | null;
}

export interface EventItem extends DiscoverBase {
  kind: 'event';
  startsAt: ISODate;
  endsAt: ISODate | null;
  /** IANA zone the event happens in (`Africa/Lagos`); times are shown in it. Null = the device's zone. */
  timeZone: string | null;
  /** Short place for rows: "Main Auditorium, Osogbo", or "Online". */
  venue: string;
  /** Full address for the detail screen: "Osogbo Campus, Osogbo, Osun, NG". */
  address: string | null;
  isOnline: boolean;
  /** Link to join an online event. */
  onlineUrl: string | null;
  host: string;
  hostLogoUrl: string | null;
  /** Full text, newlines kept. Falls back to the summary when absent. */
  description: string | null;
  /** "Conference", "Workshop"… */
  category: string | null;
  tags: string[];
  /** Null = no price given (not the same as free, which is amount 0). */
  price: { amount: number; currency: string } | null;
  capacity: number | null;
  registrationDeadline: ISODate | null;
  /** Cancelled events stay reachable by link, so shared links can explain it. */
  status: 'scheduled' | 'cancelled';
  cancellationReason: string | null;
  /** Ended: its end, or its start when it has no end, has passed. */
  isPast: boolean;
}

export interface OpportunityItem extends DiscoverBase {
  kind: 'opportunity';
  type: OpportunityType;
  organisation: string;
  organisationMonogram: string;
  location: string | null;
  arrangement: WorkArrangement | null;
  closesAt: ISODate | null;
  eligibility: string | null;
}

export interface ResourceItem extends DiscoverBase {
  kind: 'resource';
  format: ResourceFormat;
  publisher: string;
  /** e.g. "12 min read". */
  length: string | null;
}

export type DiscoverItem = EventItem | OpportunityItem | ResourceItem;
export type DiscoverFilter = 'all' | 'events' | 'opportunities' | 'resources';

export interface DiscoverHome {
  thisWeek: DiscoverItem[];
  closingSoon: OpportunityItem[];
  upcomingEvents: EventItem[];
  resources: ResourceItem[];
}

export type NotificationKind =
  | 'mention'
  | 'reply'
  | 'like'
  | 'reaction'
  | 'community'
  | 'event-reminder'
  | 'deadline';

export interface AppNotification {
  id: ID;
  kind: NotificationKind;
  actor: UserSummary | null;
  /** Rich text in plain segments; `strong` segments are set in 600 ink. */
  title: { text: string; strong?: boolean }[];
  excerpt: string | null;
  createdAt: ISODate;
  read: boolean;
  /** Visual identity when there is no actor. */
  community?: CommunitySummary;
  event?: { startsAt: ISODate };
  opportunity?: { organisationMonogram: string };
  /** In-app destination, e.g. "/community/c_tech". */
  target: string | null;
}

export interface NotificationPreferences {
  mentions: boolean;
  replies: boolean;
  likes: boolean;
  communityActivity: boolean;
  reminders: boolean;
}

/** One frame of a story: a photo, or short text on a brand colour. Stories expire after 24 hours. */
export type StoryFrame =
  | { id: ID; kind: 'image'; url: string; createdAt: ISODate; caption: string | null }
  | { id: ID; kind: 'text'; text: string; background: 'navy' | 'blue' | 'ink'; createdAt: ISODate };

/** All of one person's current story frames, oldest first. */
export interface StoryReel {
  author: UserSummary;
  isMine: boolean;
  frames: StoryFrame[];
  /** True once the viewer has seen every frame. */
  seen: boolean;
}

export interface CreateStoryInput {
  mediaUri: string;
  caption: string | null;
}

export type SavedItem =
  | { kind: 'post'; savedAt: ISODate; post: Post }
  | { kind: 'discover'; savedAt: ISODate; item: DiscoverItem };

export type SaveTarget = { kind: 'post'; id: ID } | { kind: 'discover'; id: ID };

/** The signed-in person's Kinnoc account. `profile` is null until onboarding creates it. */
export interface Account {
  id: ID;
  email: string | null;
  profile: { username: string; displayName: string } | null;
  /** Suspended and deactivated accounts may sign in but cannot use Kinnoc. */
  status: 'active' | 'suspended' | 'deactivated';
}

export interface CreateProfileInput {
  username: string;
  displayName: string;
}

/**
 * What the connected backend supports. Screens hide controls for anything it does not, rather
 * than showing actions that would fail.
 */
export interface ApiCapabilities {
  /** Posts, likes and comments: the public and communities feeds and community posts. */
  feed: boolean;
  /** Following people (and the Following feed), notifications, stories and saved items. */
  social: boolean;
  /** What Discover can list. Kinds left out get no tab. */
  discoverKinds: DiscoverItem['kind'][];
  /** Emoji reactions on messages. */
  reactions: boolean;
  /** Photos in chat messages. */
  messageAttachments: boolean;
  /** Muting and pinning conversations in the inbox. */
  inboxPreferences: boolean;
  /** Headline, location, website and free-text interests on the profile. */
  profileDetails: boolean;
  /** Interests chosen from the backend's catalogue (`profile.setInterests`). */
  interestCatalogue: boolean;
}
