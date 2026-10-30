import type { InboxEntry, Message } from '@/api/types';

import { withLiveMessage } from '../inboxCache';

const entry = (id: string, over: Partial<InboxEntry> = {}): InboxEntry => ({
  community: { id, slug: id, name: id, monogram: 'X', photoUrl: null, memberCount: 3, category: 'Design', visibility: 'public' },
  lastMessage: { seq: 5, senderName: 'Ada', isMine: false, text: 'old', kind: 'text', sentAt: '2026-10-24T10:00:00.000Z' },
  unreadCount: 0,
  receipts: null,
  hasMention: false,
  isPinned: false,
  isMuted: false,
  typing: [],
  ...over,
});

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm6',
  clientId: null,
  communityId: 'b',
  seq: 6,
  sender: { username: 'grace', displayName: 'Grace Hopper', avatarUrl: null },
  isMine: false,
  text: 'new',
  sentAt: '2026-10-24T11:00:00.000Z',
  deletedAt: null,
  replyTo: null,
  attachments: [],
  link: null,
  reactions: [],
  status: 'sent',
  ...over,
});

describe('withLiveMessage', () => {
  const inbox = [entry('pinned', { isPinned: true }), entry('a'), entry('b', { typing: ['Grace'] })];

  it('shows the message, counts it as unread, clears its sender’s typing and moves the row up', () => {
    const next = withLiveMessage(inbox, 'b', message());
    expect(next?.map((e) => e.community.id)).toEqual(['pinned', 'b', 'a']);
    expect(next?.[1]).toMatchObject({ unreadCount: 1, typing: [], lastMessage: { seq: 6, senderName: 'Grace', text: 'new' } });
  });

  it('does not count your own messages as unread', () => {
    expect(withLiveMessage(inbox, 'b', message({ isMine: true }))?.[1]).toMatchObject({ unreadCount: 0, lastMessage: { senderName: 'You' } });
  });

  it('ignores a message the row already shows, so repeats are not counted twice', () => {
    const once = withLiveMessage(inbox, 'b', message());
    expect(withLiveMessage(once, 'b', message())).toBe(once);
    expect(withLiveMessage(inbox, 'b', message({ seq: 4 }))).toBe(inbox);
  });

  it('leaves unknown communities and deleted messages alone', () => {
    expect(withLiveMessage(inbox, 'zzz', message())).toBe(inbox);
    expect(withLiveMessage(inbox, 'b', message({ deletedAt: '2026-10-24T11:00:00.000Z' }))).toBe(inbox);
  });
});
