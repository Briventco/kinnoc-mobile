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
  Community,
  CommunitySummary,
  DiscoverItem,
  FeedItem,
  InboxEntry,
  Message,
  Page,
  Post,
  Profile,
  SavedItem,
  StoryFrame,
  StoryReel,
} from '../types';
import * as fx from './fixtures';

const delay = (ms = 250 + Math.random() * 350) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function paginate<T>(items: T[], cursor: string | null, pageSize: number): Page<T> {
  const start = cursor ? Number(cursor) : 0;
  const end = start + pageSize;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

const summary = (c: Community): CommunitySummary => ({
  id: c.id,
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
  };
  const listeners = new Map<string, Set<(e: ConversationEvent) => void>>();
  const emit = (communityId: string, event: ConversationEvent) =>
    listeners.get(communityId)?.forEach((fn) => fn(event));

  // The signed-in preview name is shown until the profile is edited here.
  let profileEdited = false;
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
    const c = state.communities.find((x) => x.id === id);
    if (!c) throw new ApiError('not_found', 'Community not found', 404);
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
    if (c.membership !== 'member') throw new ApiError('forbidden', 'Join this community to see the conversation', 403);
  };

  const api: KinnocApi = {
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
      async get(id) {
        await delay();
        return clone(withSaved(findPost(id)));
      },
      async create({ text, communityId, mediaUris }) {
        await delay(600);
        if (!text.trim() && mediaUris.length === 0) {
          throw new ApiError('validation', 'Write something or add a photo', 422, { text: 'Write something or add a photo.' });
        }
        const c = communityId ? findCommunity(communityId) : null;
        const post: Post = {
          kind: 'post',
          id: `p_${Date.now()}`,
          author: meSummary(),
          community: c ? { id: c.id, name: c.name } : null,
          text: text.trim(),
          media: mediaUris.map((uri, i) => ({ id: `media_${Date.now()}_${i}`, kind: 'image', url: uri, width: 1200, height: 900 })),
          createdAt: new Date().toISOString(),
          likeCount: 0,
          commentCount: 0,
          likedByMe: false,
          savedByMe: false,
          topReply: null,
          isMine: true,
        };
        state.posts.unshift(post);
        return clone(post);
      },
      async remove(id) {
        await delay();
        const post = findPost(id);
        if (!post.isMine) throw new ApiError('forbidden', 'You can only delete your own posts', 403);
        state.posts = state.posts.filter((p) => p.id !== id);
      },
      async setLiked(id, liked) {
        await delay(200);
        const post = findPost(id);
        if (post.likedByMe !== liked) {
          post.likedByMe = liked;
          post.likeCount += liked ? 1 : -1;
        }
        return { likeCount: post.likeCount };
      },
      async comments(id, cursor) {
        await delay();
        findPost(id);
        return clone(paginate(state.comments[id] ?? [], cursor, 20));
      },
      async comment(id, text) {
        await delay(400);
        const post = findPost(id);
        if (!text.trim()) throw new ApiError('validation', 'Write a reply first', 422);
        const c = { id: `cm_${Date.now()}`, author: meSummary(), text: text.trim(), createdAt: new Date().toISOString() };
        (state.comments[id] ??= []).push(c);
        post.commentCount += 1;
        return clone(c);
      },
    },

    communities: {
      async inbox() {
        await delay();
        const entries: InboxEntry[] = state.communities
          .filter((c) => c.membership === 'member')
          .map((c) => {
            const list = state.messages[c.id] ?? [];
            const last = list[list.length - 1];
            return {
              community: summary(c),
              lastMessage: last
                ? {
                    senderName: last.isMine ? 'You' : last.sender.displayName.split(' ')[0],
                    isMine: last.isMine,
                    text: last.text,
                    kind: last.attachments.length && !last.text ? ('photo' as const) : last.link ? ('link' as const) : ('text' as const),
                    sentAt: last.sentAt,
                  }
                : null,
              unreadCount: c.unreadCount,
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
      async browse(query, cursor) {
        await delay();
        const q = query.trim().toLowerCase();
        const list = state.communities
          .filter((c) => !q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
          .sort((a, b) => Number(a.membership === 'member') - Number(b.membership === 'member') || b.memberCount - a.memberCount)
          .map((c) => ({ ...summary(c), membership: c.membership }));
        return clone(paginate(list, cursor, 20));
      },
      async get(id) {
        await delay();
        const c = findCommunity(id);
        const community: Community = {
          ...summary(c),
          description: c.description,
          membership: c.membership,
          pinned: c.pinned,
          rules: c.rules,
        };
        return clone(community);
      },
      async join(id) {
        await delay(500);
        const c = findCommunity(id);
        if (c.membership === 'none') {
          c.membership = c.visibility === 'private' ? 'pending' : 'member';
          if (c.membership === 'member') c.memberCount += 1;
        }
        return api.communities.get(id);
      },
      async leave(id) {
        await delay(400);
        const c = findCommunity(id);
        if (c.membership === 'member') c.memberCount -= 1;
        c.membership = 'none';
        c.unreadCount = 0;
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
        return clone(paginate(newestFirst, cursor, 15));
      },
      async send({ communityId, clientId, text, replyToId, attachmentUris }) {
        await delay(500);
        const c = findCommunity(communityId);
        assertMember(c);
        if (text.includes('/fail')) throw new ApiError('network', 'Simulated send failure (mock adapter)');
        const replyTo = replyToId ? findMessage(replyToId) : null;
        const message: Message = {
          id: `m_${Date.now()}`,
          clientId,
          communityId,
          sender: meSummary(),
          isMine: true,
          text: text.trim(),
          sentAt: new Date().toISOString(),
          replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.sender.displayName, text: replyTo.text } : null,
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
      async posts(userId, cursor) {
        await delay();
        return clone(paginate(state.posts.filter((p) => p.author.id === userId).map(withSaved), cursor, 10));
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
    subscribe(communityId, onEvent) {
      const set = listeners.get(communityId) ?? new Set();
      set.add(onEvent);
      listeners.set(communityId, set);
      return () => set.delete(onEvent);
    },
    sendTyping() {},
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
