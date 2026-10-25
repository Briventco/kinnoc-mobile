/** API payloads as the Kinnoc API returns them, for tests. */
import type { ApiCommunity, ApiMessage } from '../mappers';

export const apiCommunity = (over: Partial<ApiCommunity> = {}): ApiCommunity => ({
  id: '0b0f4f5e-6d43-4a39-9f0e-1f8b9d6a0c11',
  slug: 'design-lab',
  name: 'Design Lab',
  description: 'People who design things.',
  category: { slug: 'design', name: 'Design' },
  avatarUrl: null,
  coverUrl: 'https://example.supabase.co/storage/v1/object/public/community-media/u/cover.jpg',
  visibility: 'PUBLIC',
  joinPolicy: 'OPEN',
  memberCount: 12,
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:00:00.000Z',
  membership: null,
  ...over,
});

export const apiMessage = (over: Partial<ApiMessage> = {}): ApiMessage => ({
  id: 'a1d0c1f2-0000-4000-8000-000000000001',
  communityId: '0b0f4f5e-6d43-4a39-9f0e-1f8b9d6a0c11',
  seq: 7,
  clientId: null,
  sender: { username: 'ada', displayName: 'Ada Lovelace', avatarUrl: null },
  isMine: false,
  text: 'Hello',
  replyTo: null,
  sentAt: '2026-10-24T10:00:00.000Z',
  deletedAt: null,
  ...over,
});
