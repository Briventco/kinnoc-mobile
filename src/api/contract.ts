import type {
  AppNotification,
  Comment,
  Community,
  CommunitySummary,
  CreatePostInput,
  DiscoverFilter,
  DiscoverHome,
  DiscoverItem,
  FeedItem,
  FeedScope,
  ID,
  InboxEntry,
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
} from './types';

/**
 * The contract between the app and the Kinnoc backend.
 * `http/` implements it against the API service; `mock/` implements it with sample data for
 * development. Screens only ever see this interface. See docs/api-contract.md for endpoints.
 */
export interface KinnocApi {
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
    browse(query: string, cursor: string | null): Promise<Page<CommunitySummary & { membership: Community['membership'] }>>;
    get(communityId: ID): Promise<Community>;
    join(communityId: ID): Promise<Community>;
    leave(communityId: ID): Promise<void>;
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
    send(input: SendMessageInput): Promise<Message>;
    react(messageId: ID, emoji: string, add: boolean): Promise<Reaction[]>;
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
