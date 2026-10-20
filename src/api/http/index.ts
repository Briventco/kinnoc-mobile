import type { KinnocApi } from '../contract';
import type { MediaAsset } from '../types';
import type { HttpClient } from './client';

/** Uploads a local file and returns the stored asset. Endpoint: POST /media (multipart). */
async function upload(client: HttpClient, uri: string): Promise<MediaAsset> {
  const name = uri.split('/').pop() ?? 'upload.jpg';
  const ext = name.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'mp4' || ext === 'mov' ? 'video/mp4' : 'image/jpeg';
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append('file', { uri, name, type: mime } as unknown as Blob);
  return client.post<MediaAsset>('/media', { form });
}

const enc = encodeURIComponent;

/**
 * KinnocApi over HTTP. Paths follow docs/api-contract.md; keep the two in step.
 * Not yet exercised against a live backend.
 */
export function createHttpApi(client: HttpClient): KinnocApi {
  return {
    feed: {
      list: (scope, cursor) => client.get('/feed', { query: { scope, cursor } }),
      get: (id) => client.get(`/posts/${enc(id)}`),
      create: async ({ text, communityId, mediaUris }) => {
        const media = await Promise.all(mediaUris.map((uri) => upload(client, uri)));
        return client.post('/posts', { body: { text, communityId, mediaIds: media.map((m) => m.id) } });
      },
      remove: (id) => client.delete(`/posts/${enc(id)}`),
      setLiked: (id, liked) =>
        liked ? client.put(`/posts/${enc(id)}/like`) : client.delete(`/posts/${enc(id)}/like`),
      comments: (id, cursor) => client.get(`/posts/${enc(id)}/comments`, { query: { cursor } }),
      comment: (id, text) => client.post(`/posts/${enc(id)}/comments`, { body: { text } }),
    },
    communities: {
      inbox: () => client.get('/me/inbox'),
      browse: (q, cursor) => client.get('/communities', { query: { q, cursor } }),
      get: (id) => client.get(`/communities/${enc(id)}`),
      join: (id) => client.put(`/communities/${enc(id)}/membership`),
      leave: (id) => client.delete(`/communities/${enc(id)}/membership`),
      setMuted: (id, muted) => client.patch(`/communities/${enc(id)}/membership`, { body: { muted } }),
      setPinned: (id, pinned) => client.patch(`/communities/${enc(id)}/membership`, { body: { pinned } }),
      markRead: (id, lastMessageId) =>
        client.post(`/communities/${enc(id)}/read`, { body: { lastMessageId } }),
      ofUser: (userId) => client.get(`/users/${enc(userId)}/communities`),
    },
    messages: {
      list: (communityId, cursor) =>
        client.get(`/communities/${enc(communityId)}/messages`, { query: { cursor } }),
      send: async ({ communityId, clientId, text, replyToId, attachmentUris }) => {
        const media = await Promise.all(attachmentUris.map((uri) => upload(client, uri)));
        return client.post(`/communities/${enc(communityId)}/messages`, {
          body: { clientId, text, replyToId, mediaIds: media.map((m) => m.id) },
        });
      },
      react: (messageId, emoji, add) =>
        add
          ? client.put(`/messages/${enc(messageId)}/reactions/${enc(emoji)}`)
          : client.delete(`/messages/${enc(messageId)}/reactions/${enc(emoji)}`),
    },
    discover: {
      home: () => client.get('/discover/home'),
      list: (filter, q, cursor) => client.get('/discover', { query: { filter, q, cursor } }),
      get: (id) => client.get(`/discover/${enc(id)}`),
    },
    profile: {
      me: () => client.get('/me'),
      get: (userId) => client.get(`/users/${enc(userId)}`),
      update: (changes) => client.patch('/me', { body: changes }),
      posts: (userId, cursor) => client.get(`/users/${enc(userId)}/posts`, { query: { cursor } }),
    },
    notifications: {
      list: (cursor) => client.get('/me/notifications', { query: { cursor } }),
      unreadCount: async () => (await client.get<{ count: number }>('/me/notifications/unread-count')).count,
      markRead: (id) => client.post(`/me/notifications/${enc(id)}/read`),
      markAllRead: () => client.post('/me/notifications/read-all'),
      preferences: () => client.get('/me/notification-preferences'),
      updatePreferences: (prefs) => client.put('/me/notification-preferences', { body: prefs }),
    },
    stories: {
      list: () => client.get('/stories'),
      create: async ({ mediaUri, caption }) => {
        const media = await upload(client, mediaUri);
        return client.post('/stories', { body: { mediaId: media.id, caption } });
      },
      markSeen: (frameId) => client.post(`/stories/frames/${enc(frameId)}/seen`),
    },
    saved: {
      list: (cursor) => client.get('/me/saved', { query: { cursor } }),
      set: (target, saved) =>
        saved
          ? client.put(`/me/saved/${target.kind}/${enc(target.id)}`)
          : client.delete(`/me/saved/${target.kind}/${enc(target.id)}`),
    },
  };
}
