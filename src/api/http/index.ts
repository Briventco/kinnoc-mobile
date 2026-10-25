import type { KinnocApi } from '../contract';
import { unsupported } from '../errors';
import type { Category, Page, UploadedImage } from '../types';
import type { HttpClient } from './client';
import {
  type ApiAccount,
  type ApiCommunity,
  type ApiInboxEntry,
  type ApiInvitation,
  type ApiJoinRequest,
  type ApiMember,
  type ApiMessage,
  mapPage,
  toAccount,
  toApiMembership,
  toApiRole,
  toCommunity,
  toCommunityBody,
  toInboxEntry,
  toInvitation,
  toJoinRequest,
  toMember,
  toMessage,
  toOwnProfile,
} from './mappers';

const enc = encodeURIComponent;

export interface HttpApiOptions {
  /** Uploads a local image to the community media bucket and returns its key. */
  uploadCommunityImage: (localUri: string) => Promise<UploadedImage>;
}

/**
 * KinnocApi over the Kinnoc API (`/api/v1`). Routes, payloads and rules follow the API's
 * docs/communities.md and docs/chat.md. Features the API does not offer yet throw an
 * `unsupported` ApiError, and `capabilities` tells screens to hide them.
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

  return {
    capabilities: {
      social: false,
      reactions: false,
      messageAttachments: false,
      inboxPreferences: false,
      profileDetails: false,
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
      list: notAvailable('The feed'),
      get: notAvailable('Posts'),
      create: notAvailable('Posting'),
      remove: notAvailable('Posts'),
      setLiked: notAvailable('Likes'),
      comments: notAvailable('Replies'),
      comment: notAvailable('Replies'),
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
        mapPage(await client.get<Page<ApiMessage>>(`/communities/${enc(communityId)}/messages`, { query: { cursor } }), toMessage),
      since: async (communityId, seq, cursor) =>
        mapPage(
          await client.get<Page<ApiMessage>>(`/communities/${enc(communityId)}/messages`, {
            // `after` and `cursor` cannot be combined: the cursor already encodes the position.
            query: cursor ? { cursor, limit: 50 } : { after: seq, limit: 50 },
          }),
          toMessage,
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
    },
    discover: {
      home: notAvailable('Discover'),
      list: notAvailable('Discover'),
      get: notAvailable('Discover'),
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
      posts: notAvailable('Posts'),
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
