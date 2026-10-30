import type { KinnocApi } from '../contract';
import { ApiError, isApiError, unsupported } from '../errors';
import type { Category, Page, PostImage, UploadedImage } from '../types';
import type { HttpClient } from './client';
import {
  type ApiAccount,
  type ApiComment,
  type ApiCommunity,
  type ApiEvent,
  type ApiInboxEntry,
  type ApiInvitation,
  type ApiJoinRequest,
  type ApiMember,
  type ApiMessage,
  type ApiMessagePage,
  type ApiOwnVerification,
  type ApiPost,
  type ApiVerification,
  mapPage,
  NOT_VERIFIED,
  toAccount,
  toApiMembership,
  toApiRole,
  toCommunity,
  toComment,
  toCommunityBody,
  toEvent,
  toEventPage,
  toInboxEntry,
  toInvitation,
  toJoinRequest,
  toMember,
  toMessage,
  toMessagePage,
  toOwnProfile,
  toOwnVerification,
  toPost,
  toVerification,
} from './mappers';

const enc = encodeURIComponent;

/** The API searches events with 2 to 100 characters; shorter text lists everything. */
const eventSearch = (query: string) => {
  const q = query.trim().slice(0, 100);
  return q.length >= 2 ? q : undefined;
};
const WEEK = 7 * 24 * 60 * 60 * 1000;

export interface HttpApiOptions {
  /** Uploads a local image to the community media bucket and returns its key. */
  uploadCommunityImage: (localUri: string) => Promise<UploadedImage>;
  /** Uploads a local image to the post media bucket and returns its key and size. */
  uploadPostImage: (localUri: string) => Promise<PostImage>;
  /** Uploads a local image to the avatars bucket (square, small JPEG) and returns its key. */
  uploadAvatar: (localUri: string) => Promise<UploadedImage>;
  /** Deletes one of the caller's own files from the avatars bucket. */
  removeAvatarFile: (key: string) => Promise<void>;
}

/** The API's feed scopes for the app's feed tabs. There is no personalised or following feed yet. */
const FEED_SCOPE = { 'for-you': 'public', communities: 'communities' } as const;

/**
 * KinnocApi over the Kinnoc API (`/api/v1`). Routes, payloads and rules follow the API's
 * docs/api-contract.md, docs/communities.md and docs/chat.md. Features the API does not offer
 * yet throw an `unsupported` ApiError, and `capabilities` tells screens to hide them.
 */
export function createHttpApi(client: HttpClient, options: HttpApiOptions): KinnocApi {
  /** The signed-in account's ID, learned from `/users/me`, to answer "is this me?". */
  let myId: string | null = null;

  const getCommunity = async (ref: string) => toCommunity(await client.get<ApiCommunity>(`/communities/${enc(ref)}`));
  const myCommunities = async (status: 'ACTIVE' | 'REQUESTED' | 'INVITED', cursor: string | null, limit?: number) =>
    mapPage(await client.get<Page<ApiCommunity>>('/users/me/communities', { query: { status, cursor, limit } }), toCommunity);

  const loadMe = async () => {
    const [account, inbox] = await Promise.all([client.get<ApiAccount>('/users/me'), client.get<ApiInboxEntry[]>('/users/me/inbox')]);
    myId = account.id;
    // The inbox lists every community the caller is an active member of.
    return toOwnProfile(account, inbox.length);
  };

  const notAvailable = (feature: string) => () => Promise.reject(unsupported(feature));

  const currentAvatarKey = async () => (await client.get<ApiAccount>('/users/me')).profile?.avatarKey ?? null;
  /** Storage cleanup is best effort: a leftover file must never fail a change the API has made. */
  const forget = (cleanup: Promise<void>) => cleanup.catch(() => undefined);

  return {
    capabilities: {
      feed: true,
      social: false,
      // The API publishes events only; opportunities and resources are not in it yet.
      discoverKinds: ['event'],
      reactions: false,
      messageAttachments: false,
      inboxPreferences: false,
      profileDetails: false,
      interestCatalogue: true,
    },
    account: {
      load: async () => {
        const account = await client.post<ApiAccount>('/users/provision');
        myId = account.id;
        return toAccount(account);
      },
      createProfile: async ({ username, displayName }) => {
        await client.post('/profiles', { body: { username, displayName } });
        return toAccount(await client.get<ApiAccount>('/users/me'));
      },
    },
    feed: {
      list: async (scope, cursor) => {
        if (scope === 'following') throw unsupported('The Following feed');
        return mapPage(await client.get<Page<ApiPost>>('/feed', { query: { scope: FEED_SCOPE[scope], cursor } }), toPost);
      },
      community: async (ref, cursor) =>
        mapPage(await client.get<Page<ApiPost>>(`/communities/${enc(ref)}/posts`, { query: { cursor } }), toPost),
      get: async (postId) => toPost(await client.get<ApiPost>(`/posts/${enc(postId)}`)),
      create: async ({ clientId, text, communityId, media, link }) =>
        toPost(
          await client.post<ApiPost>('/posts', {
            body: {
              text,
              clientId,
              ...(communityId ? { communityId } : {}),
              ...(media.length ? { media: media.map(({ key, width, height }) => ({ key, width, height })) } : {}),
              ...(link ? { link } : {}),
            },
          }),
        ),
      update: async (postId, changes) => toPost(await client.patch<ApiPost>(`/posts/${enc(postId)}`, { body: changes })),
      remove: (postId) => client.delete(`/posts/${enc(postId)}`),
      setLiked: (postId, liked) =>
        liked
          ? client.put<{ likeCount: number; likedByMe: boolean }>(`/posts/${enc(postId)}/like`)
          : client.delete<{ likeCount: number; likedByMe: boolean }>(`/posts/${enc(postId)}/like`),
      comments: async (postId, cursor) =>
        mapPage(await client.get<Page<ApiComment>>(`/posts/${enc(postId)}/comments`, { query: { cursor } }), toComment),
      replies: async (postId, commentId, cursor) =>
        mapPage(
          await client.get<Page<ApiComment>>(`/posts/${enc(postId)}/comments/${enc(commentId)}/replies`, { query: { cursor } }),
          toComment,
        ),
      comment: async (postId, { clientId, text, parentId }) =>
        toComment(
          await client.post<ApiComment>(`/posts/${enc(postId)}/comments`, { body: { text, clientId, ...(parentId ? { parentId } : {}) } }),
        ),
      editComment: async (postId, commentId, text) =>
        toComment(await client.patch<ApiComment>(`/posts/${enc(postId)}/comments/${enc(commentId)}`, { body: { text } })),
      removeComment: (postId, commentId) => client.delete(`/posts/${enc(postId)}/comments/${enc(commentId)}`),
    },
    communities: {
      inbox: async () => (await client.get<ApiInboxEntry[]>('/users/me/inbox')).map(toInboxEntry),
      browse: async ({ query, category }, cursor) => {
        const q = query.trim();
        // The API needs 2–100 characters; a single character searches nothing yet.
        const page = await client.get<Page<ApiCommunity>>('/communities', {
          query: { q: q.length >= 2 ? q.slice(0, 100) : undefined, category, cursor },
        });
        return mapPage(page, toCommunity);
      },
      categories: () => client.get<Category[]>('/interests'),
      get: getCommunity,
      create: async (input) => toCommunity(await client.post<ApiCommunity>('/communities', { body: toCommunityBody(input) })),
      update: async (id, changes) =>
        toCommunity(await client.patch<ApiCommunity>(`/communities/${enc(id)}`, { body: toCommunityBody(changes) })),
      join: async (id) => {
        // Returns only the new membership; reload so counts and state come from the server.
        await client.post(`/communities/${enc(id)}/join`);
        return getCommunity(id);
      },
      leave: (id) => client.post(`/communities/${enc(id)}/leave`),
      cancelRequest: (id) => client.delete(`/communities/${enc(id)}/join-request`),
      declineInvitation: (id) => client.delete(`/communities/${enc(id)}/invitation`),
      mine: (status, cursor) => myCommunities(toApiMembership[status], cursor),
      members: async (id, cursor) =>
        mapPage(await client.get<Page<ApiMember>>(`/communities/${enc(id)}/members`, { query: { cursor } }), toMember),
      setRole: async (id, username, role) =>
        toMember(await client.patch<ApiMember>(`/communities/${enc(id)}/members/${enc(username)}`, { body: { role: toApiRole[role] } })),
      removeMember: (id, username) => client.delete(`/communities/${enc(id)}/members/${enc(username)}`),
      transferOwnership: async (id, username) =>
        toMember(await client.post<ApiMember>(`/communities/${enc(id)}/transfer-ownership`, { body: { username } })),
      joinRequests: async (id, cursor) =>
        mapPage(await client.get<Page<ApiJoinRequest>>(`/communities/${enc(id)}/join-requests`, { query: { cursor } }), toJoinRequest),
      approveRequest: async (id, username) =>
        toMember(await client.post<ApiMember>(`/communities/${enc(id)}/join-requests/${enc(username)}/approve`)),
      rejectRequest: (id, username) => client.post(`/communities/${enc(id)}/join-requests/${enc(username)}/reject`),
      invitations: async (id, cursor) =>
        mapPage(await client.get<Page<ApiInvitation>>(`/communities/${enc(id)}/invitations`, { query: { cursor } }), toInvitation),
      invite: async (id, username) =>
        toInvitation(await client.post<ApiInvitation>(`/communities/${enc(id)}/invitations`, { body: { username } })),
      revokeInvitation: (id, username) => client.delete(`/communities/${enc(id)}/invitations/${enc(username)}`),
      setMuted: notAvailable('Muting conversations'),
      setPinned: notAvailable('Pinning conversations'),
      markRead: (id, lastMessageId) => client.post(`/communities/${enc(id)}/read`, { body: lastMessageId ? { lastMessageId } : {} }),
      ofUser: async (userId) => {
        // Other people's memberships are not exposed by the API yet.
        if (myId && userId !== myId) throw unsupported("Other people's communities");
        return (await myCommunities('ACTIVE', null, 50)).items;
      },
    },
    messages: {
      list: async (communityId, cursor) =>
        toMessagePage(await client.get<ApiMessagePage>(`/communities/${enc(communityId)}/messages`, { query: { cursor } })),
      since: async (communityId, seq, cursor) =>
        toMessagePage(
          await client.get<ApiMessagePage>(`/communities/${enc(communityId)}/messages`, {
            // `after` and `cursor` cannot be combined: the cursor already encodes the position.
            query: cursor ? { cursor, limit: 50 } : { after: seq, limit: 50 },
          }),
        ),
      send: async ({ communityId, clientId, text, replyToId }) =>
        toMessage(
          await client.post<ApiMessage>(`/communities/${enc(communityId)}/messages`, {
            body: { text, clientId, ...(replyToId ? { replyToId } : {}) },
          }),
        ),
      remove: (communityId, messageId) => client.delete(`/communities/${enc(communityId)}/messages/${enc(messageId)}`),
      react: notAvailable('Reactions'),
    },
    media: {
      uploadCommunityImage: options.uploadCommunityImage,
      uploadPostImage: options.uploadPostImage,
    },
    discover: {
      // Upcoming published events, soonest first (events in progress included).
      home: async () => {
        const { items } = toEventPage(await client.get<Page<ApiEvent>>('/events', { query: { limit: 12 } }));
        const now = Date.now();
        const thisWeek = items.filter((e) => Date.parse(e.startsAt) < now + WEEK).slice(0, 5);
        const upcomingEvents = items.filter((e) => !thisWeek.includes(e)).slice(0, 5);
        return { thisWeek, closingSoon: [], upcomingEvents, resources: [] };
      },
      list: async (filter, query, cursor) => {
        if (filter === 'opportunities') throw unsupported('Opportunities');
        if (filter === 'resources') throw unsupported('Resources');
        return toEventPage(await client.get<Page<ApiEvent>>('/events', { query: { q: eventSearch(query), cursor } }));
      },
      // By ID or slug. Cancelled events are returned too, so a shared link can explain it.
      get: async (itemId) => {
        const event = toEvent(await client.get<ApiEvent>(`/events/${enc(itemId)}`));
        if (!event) throw new ApiError('server', "This event couldn't be shown.");
        return event;
      },
    },
    profile: {
      me: loadMe,
      get: async (userId) => {
        if (myId && userId !== myId) throw unsupported("Other people's profiles");
        return loadMe();
      },
      update: async ({ displayName, bio }) => {
        await client.patch('/profiles/me', { body: { displayName, bio: bio ?? null } });
        return loadMe();
      },
      setAvatar: async (localUri) => {
        const previous = await currentAvatarKey();
        const uploaded = await options.uploadAvatar(localUri);
        try {
          await client.patch('/profiles/me', { body: { avatarKey: uploaded.key } });
        } catch (error) {
          // The API refused it: the current photo stays, so drop the file we just added.
          await forget(options.removeAvatarFile(uploaded.key));
          throw error;
        }
        // Only now that the new photo is saved is the old file safe to delete.
        if (previous && previous !== uploaded.key) await forget(options.removeAvatarFile(previous));
        return loadMe();
      },
      removeAvatar: async () => {
        const previous = await currentAvatarKey();
        await client.patch('/profiles/me', { body: { avatarKey: null } });
        if (previous) await forget(options.removeAvatarFile(previous));
        return loadMe();
      },
      setInterests: async (slugs) => {
        await client.put('/users/me/interests', { body: { interests: slugs } });
        return loadMe();
      },
      // Newest first. Feed posts identify people by username, so any other user ID is a username.
      posts: async (userId, cursor) => {
        const path = !myId || userId === myId ? '/users/me/posts' : `/profiles/${enc(userId)}/posts`;
        try {
          return mapPage(await client.get<Page<ApiPost>>(path, { query: { cursor } }), toPost);
        } catch (error) {
          // An API deployed without these routes answers the generic NOT_FOUND.
          if (isApiError(error, 'NOT_FOUND')) throw unsupported('Your list of posts');
          throw error;
        }
      },
    },
    verification: {
      profile: async (username) => {
        try {
          return toVerification(await client.get<ApiVerification>(`/profiles/${enc(username)}/verification`));
        } catch (error) {
          // The badge follows the profile's visibility: a hidden or deleted profile has none.
          if (isApiError(error, 'PROFILE_NOT_FOUND')) return NOT_VERIFIED;
          throw error;
        }
      },
      mine: async () => toOwnVerification(await client.get<ApiOwnVerification>('/users/me/verification')),
    },
    notifications: {
      list: notAvailable('Notifications'),
      unreadCount: notAvailable('Notifications'),
      markRead: notAvailable('Notifications'),
      markAllRead: notAvailable('Notifications'),
      preferences: notAvailable('Notification settings'),
      updatePreferences: notAvailable('Notification settings'),
    },
    stories: {
      list: notAvailable('Stories'),
      create: notAvailable('Stories'),
      markSeen: notAvailable('Stories'),
    },
    saved: {
      list: notAvailable('Saved items'),
      set: notAvailable('Saving'),
    },
  };
}
