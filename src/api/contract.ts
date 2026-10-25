import type {
  Account,
  ApiCapabilities,
  AppNotification,
  Category,
  Comment,
  Community,
  CommunityBrowseFilter,
  CommunityInput,
  CommunityMember,
  CommunityRole,
  CommunitySummary,
  CreateProfileInput,
  CreatePostInput,
  DiscoverFilter,
  DiscoverHome,
  DiscoverItem,
  FeedItem,
  FeedScope,
  ID,
  InboxEntry,
  Invitation,
  JoinRequest,
  MembershipStatus,
  Message,
  NotificationPreferences,
  Page,
  Post,
  Profile,
  ProfileUpdate,
  Reaction,
  StoryReel,
  CreateStoryInput,
  SavedItem,
  SaveTarget,
  SendMessageInput,
  UploadedImage,
} from './types';

/**
 * The contract between the app and the Kinnoc backend.
 * `http/` implements it against the API service; `mock/` implements it with sample data for
 * development. Screens only ever see this interface. See docs/api-contract.md for endpoints.
 */
export interface KinnocApi {
  /** What this backend supports; screens hide the rest. */
  capabilities: ApiCapabilities;
  account: {
    /**
     * Creates or syncs the caller's account after sign-in and returns it. Idempotent; call on
     * every sign-in and app launch.
     */
    load(): Promise<Account>;
    /** Onboarding: creates the caller's profile (username and display name). */
    createProfile(input: CreateProfileInput): Promise<Account>;
  };
  feed: {
    list(scope: FeedScope, cursor: string | null): Promise<Page<FeedItem>>;
    get(postId: ID): Promise<Post>;
    create(input: CreatePostInput): Promise<Post>;
    remove(postId: ID): Promise<void>;
    setLiked(postId: ID, liked: boolean): Promise<{ likeCount: number }>;
    comments(postId: ID, cursor: string | null): Promise<Page<Comment>>;
    comment(postId: ID, text: string): Promise<Comment>;
  };
  communities: {
    inbox(): Promise<InboxEntry[]>;
    /** Public communities, newest first. */
    browse(filter: CommunityBrowseFilter, cursor: string | null): Promise<Page<Community>>;
    categories(): Promise<Category[]>;
    /** By ID or slug. */
    get(ref: string): Promise<Community>;
    create(input: CommunityInput): Promise<Community>;
    /** Owner only. Omitted fields are unchanged. */
    update(id: ID, changes: Partial<CommunityInput>): Promise<Community>;
    /** Joins, requests to join, or accepts an invitation, depending on the policy and the viewer's state. */
    join(id: ID): Promise<Community>;
    leave(id: ID): Promise<void>;
    cancelRequest(id: ID): Promise<void>;
    declineInvitation(id: ID): Promise<void>;
    /** The viewer's communities with the given relationship. */
    mine(status: Exclude<MembershipStatus, 'none'>, cursor: string | null): Promise<Page<Community>>;
    members(id: ID, cursor: string | null): Promise<Page<CommunityMember>>;
    /** Owner only. Ownership changes only through `transferOwnership`. */
    setRole(id: ID, username: string, role: Exclude<CommunityRole, 'owner'>): Promise<CommunityMember>;
    removeMember(id: ID, username: string): Promise<void>;
    /** Owner only; the previous owner becomes a moderator. */
    transferOwnership(id: ID, username: string): Promise<CommunityMember>;
    joinRequests(id: ID, cursor: string | null): Promise<Page<JoinRequest>>;
    approveRequest(id: ID, username: string): Promise<CommunityMember>;
    rejectRequest(id: ID, username: string): Promise<void>;
    invitations(id: ID, cursor: string | null): Promise<Page<Invitation>>;
    invite(id: ID, username: string): Promise<Invitation>;
    revokeInvitation(id: ID, username: string): Promise<void>;
    setMuted(communityId: ID, muted: boolean): Promise<void>;
    setPinned(communityId: ID, pinned: boolean): Promise<void>;
    /** Marks the conversation read up to `lastMessageId`, or up to the latest message when null. */
    markRead(communityId: ID, lastMessageId: ID | null): Promise<void>;
    /** Communities the given user belongs to (public memberships only for other people). */
    ofUser(userId: ID): Promise<CommunitySummary[]>;
  };
  messages: {
    /** Newest first. `cursor` pages back through older history. Members only. */
    list(communityId: ID, cursor: string | null): Promise<Page<Message>>;
    /** Catch-up after a reconnect: messages after `seq`, oldest first; follow `nextCursor` until null. */
    since(communityId: ID, seq: number, cursor: string | null): Promise<Page<Message>>;
    send(input: SendMessageInput): Promise<Message>;
    /** Sender, owner or moderator. The message keeps its place, without its text. */
    remove(communityId: ID, messageId: ID): Promise<void>;
    react(messageId: ID, emoji: string, add: boolean): Promise<Reaction[]>;
  };
  media: {
    /** Uploads a local image for a community avatar or cover. */
    uploadCommunityImage(localUri: string): Promise<UploadedImage>;
  };
  discover: {
    home(): Promise<DiscoverHome>;
    list(filter: DiscoverFilter, query: string, cursor: string | null): Promise<Page<DiscoverItem>>;
    get(itemId: ID): Promise<DiscoverItem>;
  };
  profile: {
    me(): Promise<Profile>;
    get(userId: ID): Promise<Profile>;
    update(changes: ProfileUpdate): Promise<Profile>;
    posts(userId: ID, cursor: string | null): Promise<Page<Post>>;
  };
  notifications: {
    list(cursor: string | null): Promise<Page<AppNotification>>;
    unreadCount(): Promise<number>;
    markRead(notificationId: ID): Promise<void>;
    markAllRead(): Promise<void>;
    preferences(): Promise<NotificationPreferences>;
    updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences>;
  };
  stories: {
    /** The viewer's own reel first (possibly with no frames), then unseen reels, then seen ones. */
    list(): Promise<StoryReel[]>;
    create(input: CreateStoryInput): Promise<StoryReel>;
    markSeen(frameId: ID): Promise<void>;
  };
  saved: {
    list(cursor: string | null): Promise<Page<SavedItem>>;
    set(target: SaveTarget, saved: boolean): Promise<void>;
  };
}
