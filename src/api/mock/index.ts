/**
 * DEVELOPMENT MOCK ADAPTER — not a backend.
 * Implements KinnocApi in memory over the sample fixtures so the app can be built and
 * reviewed before the API service exists. State resets when the app reloads.
 *
 * Dev affordances:
 * - A message containing "/fail" is rejected, to exercise the failed-send and retry state.
 * - Conversations in private communities are refused to non-members, as the server must.
 */
import type { KinnocApi } from '../contract';
import { ApiError } from '../errors';
import type { ConversationEvent, RealtimeClient } from '../realtime';
import type {
  Comment,
  Community,
  CommunityMember,
  CommunityRole,
  CommunitySummary,
  DiscoverItem,
  FeedItem,
  InboxEntry,
  Invitation,
  JoinRequest,
  Message,
  Page,
  Person,
  Post,
  Profile,
  SavedItem,
  StoryFrame,
  StoryReel,
} from '../types';
import * as fx from './fixtures';

const asPerson = (u: Person): Person => ({ username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl });
const people = Object.values(fx.users).filter((u) => u.id !== fx.ME_ID).map(asPerson);

const delay = (ms = 250 + Math.random() * 350) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function paginate<T>(items: T[], cursor: string | null, pageSize: number): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + pageSize;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

const summary = (c: Community): CommunitySummary => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  monogram: c.monogram,
  photoUrl: c.photoUrl,
  memberCount: c.memberCount,
  category: c.category,
  visibility: c.visibility,
});

export interface MockViewer {
  displayName: string;
  username: string;
}

export function createMockBackend(getViewer: () => MockViewer | null) {
  // Mutable in-memory state, copied so fixtures stay pristine.
  const state = {
    communities: clone(fx.communities),
    messages: clone(fx.messagesByCommunity),
    posts: clone(fx.posts),
    updates: clone(fx.updates),
    comments: clone(fx.commentsByPost),
    discover: clone(fx.discoverItems),
    notifications: clone(fx.notifications),
    prefs: clone(fx.notificationPreferences),
    profile: clone(fx.myProfile),
    saved: [] as { kind: 'post' | 'discover'; id: string; savedAt: string }[],
    typing: clone(fx.typingSeed),
    stories: clone(fx.storiesByAuthor),
    myFrames: [] as StoryFrame[],
    seenFrames: new Set(fx.seenStoryFrames),
    /** Other members per community; the viewer is added from `membership` and `role`. */
    members: {} as Record<string, CommunityMember[]>,
    joinRequests: {} as Record<string, JoinRequest[]>,
    invitations: {} as Record<string, Invitation[]>,
  };
  // Sequence numbers in send order, as the server assigns them.
  for (const list of Object.values(state.messages)) list.forEach((m, i) => (m.seq = i + 1));
  state.communities.forEach((c, i) => {
    const others = people.slice(0, 3 + (i % 5));
    state.members[c.id] = others.map((p, j) => ({
      ...p,
      role: (j === 0 && c.role !== 'owner' ? 'owner' : j === 1 ? 'moderator' : 'member') as CommunityRole,
      joinedAt: new Date(Date.now() - (j + 2) * 86_400_000 * 7).toISOString(),
    }));
    state.joinRequests[c.id] = c.joinPolicy === 'approval' && c.role === 'owner' ? [{ user: people[people.length - 1], requestedAt: new Date(Date.now() - 3_600_000).toISOString() }] : [];
    state.invitations[c.id] = [];
  });
  /** Idempotency: client IDs already used for posts and comments. */
  const postsByClientId = new Map<string, string>();
  const commentsByClientId = new Map<string, string>();
  // Sample comments are stored without their post ID.
  for (const [postId, list] of Object.entries(state.comments)) list.forEach((c) => (c.postId = postId));
  const listeners = new Map<string, Set<(e: ConversationEvent) => void>>();
  const emit = (communityId: string, event: ConversationEvent) =>
    listeners.get(communityId)?.forEach((fn) => fn(event));

  // The signed-in preview name is shown until the profile is edited here.
  let profileEdited = false;
  /** The mock keeps the picked file's local URI as the photo, on the profile and on your posts. */
  const setMyAvatar = (uri: string | null) => {
    state.profile = { ...state.profile, avatarUrl: uri };
    for (const post of state.posts) if (post.author.id === fx.ME_ID) post.author = { ...post.author, avatarUrl: uri };
  };

  const me = (): Profile => {
    const viewer = getViewer();
    if (!viewer) return state.profile;
    return {
      ...state.profile,
      displayName: profileEdited ? state.profile.displayName : viewer.displayName,
      username: viewer.username || state.profile.username,
    };
  };
  const meSummary = () => {
    const p = me();
    return { id: p.id, displayName: p.displayName, username: p.username, avatarUrl: p.avatarUrl };
  };

  const findCommunity = (id: string) => {
    const c = state.communities.find((x) => x.id === id || x.slug === id);
    if (!c) throw new ApiError('not_found', 'Community not found', 404, {}, 'COMMUNITY_NOT_FOUND');
    return c;
  };
  const findPost = (id: string) => {
    const p = state.posts.find((x) => x.id === id);
    if (!p) throw new ApiError('not_found', 'Post not found', 404);
    return p;
  };
  const findDiscover = (id: string) => {
    const d = state.discover.find((x) => x.id === id);
    if (!d) throw new ApiError('not_found', 'Item not found', 404);
    return d;
  };
  const findMessage = (id: string) => {
    for (const list of Object.values(state.messages)) {
      const m = list.find((x) => x.id === id);
      if (m) return m;
    }
    throw new ApiError('not_found', 'Message not found', 404);
  };
  const isSaved = (kind: 'post' | 'discover', id: string) => state.saved.some((s) => s.kind === kind && s.id === id);
  const withSaved = <T extends Post | DiscoverItem>(item: T): T => ({
    ...item,
    savedByMe: isSaved(item.kind === 'post' ? 'post' : 'discover', item.id),
  });
  const assertMember = (c: Community) => {
    if (c.membership !== 'member') throw new ApiError('forbidden', 'Join this community to see the conversation', 403, {}, 'MEMBERSHIP_REQUIRED');
  };
  const assertRole = (c: Community, roles: CommunityRole[]) => {
    if (!c.role || !roles.includes(c.role)) throw new ApiError('forbidden', 'Not allowed', 403, {}, 'INSUFFICIENT_COMMUNITY_ROLE');
  };
  /** Mock communities keep a few extra fields for the inbox; strip them like the API would. */
  const toCommunity = (c: Community): Community => ({
    ...summary(c),
    description: c.description,
    categorySlug: c.categorySlug,
    coverUrl: c.coverUrl,
    joinPolicy: c.joinPolicy,
    membership: c.membership,
    role: c.role,
    pinned: c.pinned,
    rules: c.rules,
  });
  const membersOf = (c: Community): CommunityMember[] => {
    const others = state.members[c.id] ?? [];
    if (c.membership !== 'member' || !c.role) return others;
    const meMember: CommunityMember = { ...asPerson(meSummary()), role: c.role, joinedAt: new Date(Date.now() - 30 * 86_400_000).toISOString() };
    return [meMember, ...others];
  };
  const findMember = (c: Community, username: string) => {
    const m = (state.members[c.id] ?? []).find((x) => x.username === username);
    if (!m) throw new ApiError('not_found', 'Member not found', 404, {}, 'MEMBER_NOT_FOUND');
    return m;
  };

  const api: KinnocApi = {
    capabilities: {
      feed: true,
      social: true,
      discoverKinds: ['event', 'opportunity', 'resource'],
      reactions: true,
      messageAttachments: true,
      inboxPreferences: true,
      profileDetails: true,
      interestCatalogue: false,
    },
    account: {
      async load() {
        await delay(150);
        const p = me();
        return { id: p.id, email: null, profile: { username: p.username, displayName: p.displayName }, status: 'active' as const };
      },
      async createProfile() {
        return api.account.load();
      },
    },
    media: {
      async uploadCommunityImage(localUri) {
        await delay(600);
        return { key: localUri, url: localUri, width: 1200, height: 900 };
      },
      async uploadPostImage(localUri) {
        await delay(600);
        return { key: localUri, url: localUri, width: 1200, height: 900 };
      },
    },
    feed: {
      async list(scope, cursor) {
        await delay();
        const joined = new Set(state.communities.filter((c) => c.membership === 'member').map((c) => c.id));
        let items: FeedItem[] = [...state.updates, ...state.posts]
          .filter((i) => (i.kind === 'post' ? true : joined.has(i.community.id)))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (scope === 'communities') {
          items = items.filter((i) => (i.kind === 'update' ? true : i.community && joined.has(i.community.id)));
        } else if (scope === 'following') {
          const following = new Set(['u_deborah', 'u_tobi', 'u_esther']);
          items = items.filter((i) => i.kind === 'post' && following.has(i.author.id));
        }
        const page = paginate(items, cursor, 6);
        return clone({ ...page, items: page.items.map((i) => (i.kind === 'post' ? withSaved(i) : i)) });
      },
      async community(ref, cursor) {
        await delay();
        const c = findCommunity(ref);
        if (c.visibility !== 'public' || c.joinPolicy !== 'open') assertMember(c);
        return clone(paginate(state.posts.filter((p) => p.community?.id === c.id).map(withSaved), cursor, 10));
      },
      async get(id) {
        await delay();
        return clone(withSaved(findPost(id)));
      },
      async create({ clientId, text, communityId, media, link }) {
        await delay(600);
        const existing = postsByClientId.get(clientId);
        if (existing) return clone(withSaved(findPost(existing)));
        if (!text.trim()) throw new ApiError('validation', 'Write something first', 400, { text: 'Write something first.' }, 'VALIDATION_FAILED');
        const c = communityId ? findCommunity(communityId) : null;
        if (c) assertMember(c);
        const post: Post = {
          kind: 'post',
          id: `p_${Date.now()}`,
          author: meSummary(),
          community: c ? { id: c.id, name: c.name } : null,
          text: text.trim(),
          media: media.map((m) => ({ id: m.key, kind: 'image', url: m.url, width: m.width, height: m.height })),
          link: link ? { url: link, domain: link.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0] } : null,
          createdAt: new Date().toISOString(),
          editedAt: null,
          likeCount: 0,
          commentCount: 0,
          likedByMe: false,
          savedByMe: false,
          topReply: null,
          isMine: true,
        };
        state.posts.unshift(post);
        postsByClientId.set(clientId, post.id);
        return clone(post);
      },
      async update(id, { text, link }) {
        await delay();
        const post = findPost(id);
        if (!post.isMine) throw new ApiError('forbidden', 'Only the author can edit this post', 403, {}, 'CONTENT_FORBIDDEN');
        if (text !== undefined) post.text = text.trim();
        if (link !== undefined) post.link = link ? { url: link, domain: link.replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0] } : null;
        post.editedAt = new Date().toISOString();
        return clone(withSaved(post));
      },
      async remove(id) {
        await delay();
        const post = findPost(id);
        if (!post.isMine) throw new ApiError('forbidden', 'You can only delete your own posts', 403, {}, 'CONTENT_FORBIDDEN');
        state.posts = state.posts.filter((p) => p.id !== id);
      },
      async setLiked(id, liked) {
        await delay(200);
        const post = findPost(id);
        if (post.likedByMe !== liked) {
          post.likedByMe = liked;
          post.likeCount += liked ? 1 : -1;
        }
        return { likeCount: post.likeCount, likedByMe: post.likedByMe };
      },
      async comments(id, cursor) {
        await delay();
        findPost(id);
        const top = (state.comments[id] ?? []).filter((c) => !c.parentId && (!c.deletedAt || c.replyCount > 0));
        return clone(paginate(top, cursor, 20));
      },
      async replies(id, commentId, cursor) {
        await delay();
        findPost(id);
        const replies = (state.comments[id] ?? []).filter((c) => c.parentId === commentId && !c.deletedAt);
        return clone(paginate(replies, cursor, 20));
      },
      async comment(id, { clientId, text, parentId }) {
        await delay(400);
        const post = findPost(id);
        const list = (state.comments[id] ??= []);
        const existing = commentsByClientId.get(clientId);
        if (existing) return clone(list.find((c) => c.id === existing)!);
        if (!text.trim()) throw new ApiError('validation', 'Write a reply first', 400, {}, 'VALIDATION_FAILED');
        const parent = parentId ? list.find((c) => c.id === parentId) : null;
        if (parentId && (!parent || parent.parentId || parent.deletedAt)) throw new ApiError('validation', 'Invalid parent', 400, {}, 'INVALID_PARENT');
        const c: Comment = {
          id: `cm_${Date.now()}`,
          postId: id,
          parentId,
          author: meSummary(),
          text: text.trim(),
          isMine: true,
          replyCount: 0,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
        };
        list.push(c);
        if (parent) parent.replyCount += 1;
        commentsByClientId.set(clientId, c.id);
        post.commentCount += 1;
        return clone(c);
      },
      async editComment(id, commentId, text) {
        await delay();
        const c = (state.comments[id] ?? []).find((x) => x.id === commentId && !x.deletedAt);
        if (!c) throw new ApiError('not_found', 'Comment not found', 404, {}, 'COMMENT_NOT_FOUND');
        if (!c.isMine) throw new ApiError('forbidden', 'Only the author can edit this comment', 403, {}, 'CONTENT_FORBIDDEN');
        c.text = text.trim();
        c.editedAt = new Date().toISOString();
        return clone(c);
      },
      async removeComment(id, commentId) {
        await delay();
        const post = findPost(id);
        const list = state.comments[id] ?? [];
        const c = list.find((x) => x.id === commentId && !x.deletedAt);
        if (!c) return;
        if (!c.isMine && !post.isMine) throw new ApiError('forbidden', 'Not allowed', 403, {}, 'CONTENT_FORBIDDEN');
        c.deletedAt = new Date().toISOString();
        c.text = '';
        c.author = null;
        if (c.parentId) {
          const parent = list.find((x) => x.id === c.parentId);
          if (parent) parent.replyCount -= 1;
        }
        post.commentCount -= 1;
      },
    },

    communities: {
      async inbox() {
        await delay();
        const entries: InboxEntry[] = state.communities
          .filter((c) => c.membership === 'member')
          .map((c) => {
            const list = (state.messages[c.id] ?? []).filter((m) => !m.deletedAt);
            const last = list[list.length - 1];
            return {
              community: summary(c),
              lastMessage: last
                ? {
                    seq: last.seq,
                    senderName: last.isMine ? 'You' : (last.sender?.displayName.split(' ')[0] ?? 'Former member'),
                    isMine: last.isMine,
                    text: last.text,
                    kind: last.attachments.length && !last.text ? ('photo' as const) : last.link ? ('link' as const) : ('text' as const),
                    sentAt: last.sentAt,
                  }
                : null,
              unreadCount: c.unreadCount,
              // Sample messages carry their own status instead of receipt positions.
              receipts: null,
              hasMention: c.hasMention,
              isPinned: c.isPinned,
              isMuted: c.isMuted,
              typing: state.typing[c.id] ?? [],
            };
          })
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
            return (b.lastMessage?.sentAt ?? '').localeCompare(a.lastMessage?.sentAt ?? '');
          });
        return clone(entries);
      },
      async browse({ query, category }, cursor) {
        await delay();
        const q = query.trim().toLowerCase();
        const list = state.communities
          .filter((c) => c.visibility === 'public')
          .filter((c) => !category || c.categorySlug === category)
          .filter((c) => q.length < 2 || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
          .sort((a, b) => Number(a.membership === 'member') - Number(b.membership === 'member') || b.memberCount - a.memberCount)
          .map(toCommunity);
        return clone(paginate(list, cursor, 20));
      },
      async categories() {
        await delay(150);
        const seen = new Map(state.communities.map((c) => [c.categorySlug, c.category]));
        return [...seen].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
      },
      async get(ref) {
        await delay();
        return clone(toCommunity(findCommunity(ref)));
      },
      async create(input) {
        await delay(600);
        if (state.communities.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) {
          throw new ApiError('conflict', 'A community with that name exists', 409, {}, 'SLUG_TAKEN');
        }
        const name = input.name.trim();
        const c = {
          id: `c_${Date.now()}`,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          name,
          monogram: name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
          photoUrl: input.avatarKey ?? null,
          coverUrl: input.coverKey ?? null,
          memberCount: 1,
          category: state.communities.find((x) => x.categorySlug === input.category)?.category ?? input.category,
          categorySlug: input.category,
          visibility: input.visibility,
          joinPolicy: input.visibility === 'private' ? ('invite-only' as const) : input.joinPolicy,
          description: input.description.trim(),
          membership: 'member' as const,
          role: 'owner' as const,
          pinned: null,
          rules: [],
          isPinned: false,
          isMuted: false,
          unreadCount: 0,
          hasMention: false,
        };
        state.communities.unshift(c);
        state.members[c.id] = [];
        state.joinRequests[c.id] = [];
        state.invitations[c.id] = [];
        state.messages[c.id] = [];
        return clone(toCommunity(c));
      },
      async update(id, changes) {
        await delay(500);
        const c = findCommunity(id);
        if (c.role !== 'owner') throw new ApiError('forbidden', 'Owner only', 403, {}, 'INSUFFICIENT_COMMUNITY_ROLE');
        if (changes.name !== undefined) c.name = changes.name.trim();
        if (changes.description !== undefined) c.description = changes.description.trim();
        if (changes.category !== undefined) c.categorySlug = changes.category;
        if (changes.visibility !== undefined) c.visibility = changes.visibility;
        if (changes.joinPolicy !== undefined) c.joinPolicy = changes.joinPolicy;
        if (c.visibility === 'private') c.joinPolicy = 'invite-only';
        if (changes.avatarKey !== undefined) c.photoUrl = changes.avatarKey;
        if (changes.coverKey !== undefined) c.coverUrl = changes.coverKey;
        return clone(toCommunity(c));
      },
      async join(id) {
        await delay(500);
        const c = findCommunity(id);
        if (c.membership === 'invited' || (c.membership !== 'member' && c.joinPolicy === 'open')) {
          c.membership = 'member';
          c.role = 'member';
          c.memberCount += 1;
          state.messages[c.id] ??= [];
        } else if (c.membership === 'none') {
          if (c.joinPolicy === 'invite-only') throw new ApiError('forbidden', 'Invitation required', 403, {}, 'INVITATION_REQUIRED');
          c.membership = 'pending';
        }
        return api.communities.get(id);
      },
      async leave(id) {
        await delay(400);
        const c = findCommunity(id);
        if (c.role === 'owner') throw new ApiError('conflict', 'Owner cannot leave', 409, {}, 'OWNER_CANNOT_LEAVE');
        if (c.membership === 'member') c.memberCount -= 1;
        c.membership = 'none';
        c.role = null;
        c.unreadCount = 0;
      },
      async cancelRequest(id) {
        await delay(300);
        const c = findCommunity(id);
        if (c.membership === 'pending') c.membership = 'none';
      },
      async declineInvitation(id) {
        await delay(300);
        const c = findCommunity(id);
        if (c.membership === 'invited') c.membership = 'none';
      },
      async mine(status, cursor) {
        await delay();
        return clone(paginate(state.communities.filter((c) => c.membership === status).map(toCommunity), cursor, 20));
      },
      async members(id, cursor) {
        await delay();
        const c = findCommunity(id);
        if (c.membership !== 'member' && c.visibility !== 'public') throw new ApiError('forbidden', 'Members only', 403, {}, 'MEMBERSHIP_REQUIRED');
        return clone(paginate(membersOf(c), cursor, 20));
      },
      async setRole(id, username, role) {
        await delay(300);
        const c = findCommunity(id);
        assertRole(c, ['owner']);
        const m = findMember(c, username);
        m.role = role;
        return clone(m);
      },
      async removeMember(id, username) {
        await delay(300);
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        const m = findMember(c, username);
        if (m.role !== 'member' && c.role !== 'owner') throw new ApiError('forbidden', 'Owner only', 403, {}, 'INSUFFICIENT_COMMUNITY_ROLE');
        state.members[c.id] = state.members[c.id].filter((x) => x.username !== username);
        c.memberCount -= 1;
      },
      async transferOwnership(id, username) {
        await delay(400);
        const c = findCommunity(id);
        assertRole(c, ['owner']);
        const m = findMember(c, username);
        m.role = 'owner';
        c.role = 'moderator';
        return clone(m);
      },
      async joinRequests(id, cursor) {
        await delay();
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        return clone(paginate(state.joinRequests[c.id] ?? [], cursor, 20));
      },
      async approveRequest(id, username) {
        await delay(300);
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        const request = (state.joinRequests[c.id] ?? []).find((r) => r.user.username === username);
        if (!request) throw new ApiError('not_found', 'Request not found', 404, {}, 'JOIN_REQUEST_NOT_FOUND');
        state.joinRequests[c.id] = state.joinRequests[c.id].filter((r) => r !== request);
        const member: CommunityMember = { ...request.user, role: 'member', joinedAt: new Date().toISOString() };
        state.members[c.id].push(member);
        c.memberCount += 1;
        return clone(member);
      },
      async rejectRequest(id, username) {
        await delay(300);
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        state.joinRequests[c.id] = (state.joinRequests[c.id] ?? []).filter((r) => r.user.username !== username);
      },
      async invitations(id, cursor) {
        await delay();
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        return clone(paginate(state.invitations[c.id] ?? [], cursor, 20));
      },
      async invite(id, username) {
        await delay(400);
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        const name = username.trim().toLowerCase();
        const user = Object.values(fx.users).find((u) => u.username === name && u.id !== fx.ME_ID);
        if (!user) throw new ApiError('not_found', 'No such user', 404, {}, 'PROFILE_NOT_FOUND');
        if (state.members[c.id].some((m) => m.username === name)) throw new ApiError('conflict', 'Already a member', 409, {}, 'ALREADY_MEMBER');
        if (state.invitations[c.id].some((i) => i.user.username === name)) throw new ApiError('conflict', 'Already invited', 409, {}, 'ALREADY_INVITED');
        const invitation: Invitation = { user: asPerson(user), invitedBy: asPerson(meSummary()), invitedAt: new Date().toISOString() };
        state.invitations[c.id].push(invitation);
        return clone(invitation);
      },
      async revokeInvitation(id, username) {
        await delay(300);
        const c = findCommunity(id);
        assertRole(c, ['owner', 'moderator']);
        state.invitations[c.id] = state.invitations[c.id].filter((i) => i.user.username !== username);
      },
      async setMuted(id, muted) {
        await delay(200);
        findCommunity(id).isMuted = muted;
      },
      async setPinned(id, pinned) {
        await delay(200);
        findCommunity(id).isPinned = pinned;
      },
      async markRead(id) {
        await delay(150);
        const c = findCommunity(id);
        c.unreadCount = 0;
        c.hasMention = false;
      },
      async ofUser(userId) {
        await delay();
        if (userId !== fx.ME_ID) return [];
        return clone(state.communities.filter((c) => c.membership === 'member').map(summary));
      },
    },

    messages: {
      async list(communityId, cursor) {
        await delay();
        assertMember(findCommunity(communityId));
        const newestFirst = [...(state.messages[communityId] ?? [])].reverse();
        return clone({ ...paginate(newestFirst, cursor, 15), receipts: null });
      },
      async since(communityId, seq, cursor) {
        await delay(150);
        assertMember(findCommunity(communityId));
        const newer = (state.messages[communityId] ?? []).filter((m) => (m.seq ?? 0) > seq);
        return clone({ ...paginate(newer, cursor, 50), receipts: null });
      },
      async remove(communityId, messageId) {
        await delay(250);
        const c = findCommunity(communityId);
        assertMember(c);
        const m = findMessage(messageId);
        if (!m.isMine && c.role !== 'owner' && c.role !== 'moderator') {
          throw new ApiError('forbidden', 'Not allowed', 403, {}, 'INSUFFICIENT_COMMUNITY_ROLE');
        }
        m.deletedAt ??= new Date().toISOString();
        m.text = '';
        m.attachments = [];
        m.link = null;
        emit(communityId, { type: 'deleted', messageId });
      },
      async send({ communityId, clientId, text, replyToId, attachmentUris }) {
        await delay(500);
        const c = findCommunity(communityId);
        assertMember(c);
        if (text.includes('/fail')) throw new ApiError('network', 'Simulated send failure (mock adapter)');
        const replyTo = replyToId ? findMessage(replyToId) : null;
        const existing = (state.messages[communityId] ?? []).find((m) => m.clientId === clientId);
        if (existing) return clone(existing);
        const message: Message = {
          id: `m_${Date.now()}`,
          clientId,
          communityId,
          seq: (state.messages[communityId]?.length ?? 0) + 1,
          sender: asPerson(meSummary()),
          isMine: true,
          text: text.trim(),
          sentAt: new Date().toISOString(),
          deletedAt: null,
          replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.sender?.displayName ?? 'Former member', text: replyTo.text || 'Deleted message' } : null,
          attachments: attachmentUris.map((uri, i) => ({ id: `att_${Date.now()}_${i}`, kind: 'image', url: uri, width: 1200, height: 900 })),
          link: null,
          reactions: [],
          status: 'sent',
        };
        (state.messages[communityId] ??= []).push(message);
        return clone(message);
      },
      async react(messageId, emoji, add) {
        await delay(150);
        const m = findMessage(messageId);
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (add && !existing?.reactedByMe) {
          if (existing) {
            existing.count += 1;
            existing.reactedByMe = true;
          } else m.reactions.push({ emoji, count: 1, reactedByMe: true });
        } else if (!add && existing?.reactedByMe) {
          existing.count -= 1;
          existing.reactedByMe = false;
          if (existing.count <= 0) m.reactions = m.reactions.filter((r) => r !== existing);
        }
        return clone(m.reactions);
      },
    },

    discover: {
      async home() {
        await delay();
        const items = state.discover.map(withSaved);
        const byKind = <K extends DiscoverItem['kind']>(k: K) => items.filter((i): i is Extract<DiscoverItem, { kind: K }> => i.kind === k);
        const opps = byKind('opportunity')
          .filter((o) => o.closesAt)
          .sort((a, b) => a.closesAt!.localeCompare(b.closesAt!));
        const events = byKind('event').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return clone({
          thisWeek: [events[0], opps.find((o) => o.type === 'scholarship'), byKind('resource')[0]].filter(Boolean) as DiscoverItem[],
          closingSoon: opps.slice(0, 3),
          upcomingEvents: events.slice(1, 4),
          resources: byKind('resource'),
        });
      },
      async list(filter, query, cursor) {
        await delay();
        const q = query.trim().toLowerCase();
        const kind = { all: null, events: 'event', opportunities: 'opportunity', resources: 'resource' }[filter];
        const list = state.discover
          .filter((i) => !kind || i.kind === kind)
          .filter((i) => !q || i.title.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q))
          .map(withSaved);
        return clone(paginate(list, cursor, 10));
      },
      async get(id) {
        await delay();
        return clone(withSaved(findDiscover(id)));
      },
    },

    profile: {
      async me() {
        await delay();
        return clone({ ...me(), communityCount: state.communities.filter((c) => c.membership === 'member').length });
      },
      async get(userId) {
        await delay();
        if (userId === fx.ME_ID) return api.profile.me();
        const u = Object.values(fx.users).find((x) => x.id === userId);
        if (!u) throw new ApiError('not_found', 'Person not found', 404);
        return clone({
          ...u,
          headline: null,
          location: null,
          bio: null,
          website: null,
          interests: [],
          interestSlugs: [],
          followerCount: 0,
          followingCount: 0,
          communityCount: 0,
          isMe: false,
          isFollowing: false,
        });
      },
      async update(changes) {
        await delay(500);
        if (!changes.displayName.trim()) throw new ApiError('validation', 'Add your name', 422, { displayName: 'Add your name.' });
        state.profile = { ...state.profile, ...changes };
        profileEdited = true;
        return api.profile.me();
      },
      async setAvatar(localUri) {
        await delay(700);
        setMyAvatar(localUri);
        return api.profile.me();
      },
      async removeAvatar() {
        await delay(400);
        setMyAvatar(null);
        return api.profile.me();
      },
      async posts(userId, cursor) {
        await delay();
        return clone(paginate(state.posts.filter((p) => p.author.id === userId).map(withSaved), cursor, 10));
      },
      async setInterests(slugs) {
        await delay(400);
        const catalogue = await api.communities.categories();
        const picked = slugs.map((slug) => catalogue.find((c) => c.slug === slug)).filter((c) => !!c);
        state.profile = { ...state.profile, interests: picked.map((c) => c.name), interestSlugs: picked.map((c) => c.slug) };
        profileEdited = true;
        return api.profile.me();
      },
    },

    verification: {
      async profile(username) {
        await delay(150);
        return clone(fx.verifications[username] ?? { isVerified: false, category: null, organisation: null, position: null, verifiedAt: null });
      },
      async mine() {
        await delay(150);
        const v = fx.verifications[me().username];
        return clone(v ? { ...v, status: 'active' as const, expiresAt: null } : { isVerified: false, status: 'none' as const, category: null, organisation: null, position: null, verifiedAt: null, expiresAt: null });
      },
    },

    notifications: {
      async list(cursor) {
        await delay();
        return clone(paginate(state.notifications, cursor, 20));
      },
      async unreadCount() {
        await delay(150);
        return state.notifications.filter((n) => !n.read).length;
      },
      async markRead(id) {
        await delay(150);
        const n = state.notifications.find((x) => x.id === id);
        if (n) n.read = true;
      },
      async markAllRead() {
        await delay(300);
        state.notifications.forEach((n) => (n.read = true));
      },
      async preferences() {
        await delay();
        return clone(state.prefs);
      },
      async updatePreferences(prefs) {
        await delay(300);
        state.prefs = { ...prefs };
        return clone(state.prefs);
      },
    },

    stories: {
      async list() {
        await delay();
        const reels: StoryReel[] = state.stories
          .filter((s) => s.frames.length)
          .map((s) => ({ author: s.author, isMine: false, frames: s.frames, seen: s.frames.every((f) => state.seenFrames.has(f.id)) }))
          .sort((a, b) => Number(a.seen) - Number(b.seen));
        const mine: StoryReel = { author: meSummary(), isMine: true, frames: state.myFrames, seen: true };
        return clone([mine, ...reels]);
      },
      async create({ mediaUri, caption }) {
        await delay(700);
        state.myFrames.push({ id: `sf_me_${Date.now()}`, kind: 'image', url: mediaUri, createdAt: new Date().toISOString(), caption });
        return clone({ author: meSummary(), isMine: true, frames: state.myFrames, seen: true });
      },
      async markSeen(frameId) {
        await delay(100);
        state.seenFrames.add(frameId);
      },
    },

    saved: {
      async list(cursor) {
        await delay();
        const items: SavedItem[] = [...state.saved]
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
          .flatMap((s): SavedItem[] => {
            if (s.kind === 'post') {
              const post = state.posts.find((p) => p.id === s.id);
              return post ? [{ kind: 'post', savedAt: s.savedAt, post: withSaved(post) }] : [];
            }
            const item = state.discover.find((d) => d.id === s.id);
            return item ? [{ kind: 'discover', savedAt: s.savedAt, item: withSaved(item) }] : [];
          });
        return clone(paginate(items, cursor, 20));
      },
      async set(target, saved) {
        await delay(200);
        if (target.kind === 'post') findPost(target.id);
        else findDiscover(target.id);
        state.saved = state.saved.filter((s) => !(s.kind === target.kind && s.id === target.id));
        if (saved) state.saved.push({ ...target, savedAt: new Date().toISOString() });
      },
    },
  };

  /** Mock realtime: shows a short typing indicator after you send, to exercise the channel. */
  const realtime: RealtimeClient = {
    live: false,
    subscribe(communityId, onEvent) {
      const set = listeners.get(communityId) ?? new Set();
      set.add(onEvent);
      listeners.set(communityId, set);
      return () => set.delete(onEvent);
    },
    sendTyping() {},
    status: () => 'idle',
    onStatus: () => () => {},
    reset() {},
  };

  const send = api.messages.send;
  api.messages.send = async (input) => {
    const message = await send(input);
    const { communityId } = input;
    setTimeout(() => emit(communityId, { type: 'typing', communityId, names: ['Tovia'] }), 1200);
    setTimeout(() => emit(communityId, { type: 'typing', communityId, names: [] }), 4200);
    return message;
  };

  return { api, realtime };
}
