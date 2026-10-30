import type { InboxEntry, Message, MessagePage, Receipts } from '@/api/types';
import { keys, queryClient } from '@/lib/query';

import { applyConversationEvent, applyInboxEvent, loadInbox, loadMessages } from '../hooks';

jest.mock('@/services', () => ({
  api: { messages: { list: jest.fn(), since: jest.fn() }, communities: { inbox: jest.fn() } },
  realtime: { live: true, subscribe: jest.fn(), sendTyping: jest.fn(), status: () => 'idle', onStatus: () => () => {}, reset: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { messages: { list: jest.Mock; since: jest.Mock }; communities: { inbox: jest.Mock } } };

const C = 'c1';
const receiptsOf = (id = C) => queryClient.getQueryData<Receipts | null>(keys.receipts(id));
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

const message = (seq: number, over: Partial<Message> = {}): Message => ({
  id: `m${seq}`,
  clientId: null,
  communityId: C,
  seq,
  sender: { username: 'ada', displayName: 'Ada', avatarUrl: null },
  isMine: false,
  text: `#${seq}`,
  sentAt: '2026-10-25T10:00:00.000Z',
  deletedAt: null,
  replyTo: null,
  attachments: [],
  link: null,
  reactions: [],
  status: 'sent',
  ...over,
});

const page = (items: Message[], receipts: Receipts | null, nextCursor: string | null = null): MessagePage => ({ items, nextCursor, receipts });

const entry = (id: string, over: Partial<InboxEntry> = {}): InboxEntry => ({
  community: { id, slug: id, name: id, monogram: 'X', photoUrl: null, memberCount: 3, category: 'Design', visibility: 'public' },
  lastMessage: { seq: 5, senderName: 'You', isMine: true, text: 'hi', kind: 'text', sentAt: '2026-10-25T10:00:00.000Z' },
  unreadCount: 0,
  receipts: null,
  hasMention: false,
  isPinned: false,
  isMuted: false,
  typing: [],
  ...over,
});

const handlers = () => ({ onTyping: jest.fn(), onLostAccess: jest.fn() });

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});

describe('receipt state', () => {
  it('records receipts from a page of history', async () => {
    api.messages.list.mockResolvedValue(page([message(5)], { deliveredSeq: 5, readSeq: 4 }));
    await loadMessages(C, null);
    expect(receiptsOf()).toEqual({ deliveredSeq: 5, readSeq: 4 });
  });

  it('records receipts for every conversation in the inbox', async () => {
    api.communities.inbox.mockResolvedValue([entry('a', { receipts: { deliveredSeq: 2, readSeq: 1 } }), entry('b')]);
    await loadInbox();
    expect(receiptsOf('a')).toEqual({ deliveredSeq: 2, readSeq: 1 });
    expect(receiptsOf('b')).toBeUndefined();
  });

  it('takes receipts from the subscribe acknowledgement, then from the catch-up pages', async () => {
    queryClient.setQueryData(keys.messages(C), { pages: [page([message(5)], null)], pageParams: [null] });
    api.messages.since.mockResolvedValueOnce(page([message(6)], { deliveredSeq: 6, readSeq: 5 }, 'next'));
    api.messages.since.mockResolvedValueOnce(page([message(7)], { deliveredSeq: 7, readSeq: 5 }));

    applyConversationEvent(C, { type: 'subscribed', lastSeq: 7, receipts: { deliveredSeq: 5, readSeq: 5 } }, handlers());
    expect(receiptsOf()).toEqual({ deliveredSeq: 5, readSeq: 5 });
    await flush();
    await flush();
    expect(api.messages.since).toHaveBeenCalledWith(C, 5, null);
    expect(api.messages.since).toHaveBeenCalledWith(C, 5, 'next');
    expect(receiptsOf()).toEqual({ deliveredSeq: 7, readSeq: 5 });
  });

  it('applies live receipts events and never moves a position back', () => {
    applyConversationEvent(C, { type: 'receipts', receipts: { deliveredSeq: 9, readSeq: 9 } }, handlers());
    applyConversationEvent(C, { type: 'receipts', receipts: { deliveredSeq: 8, readSeq: 7 } }, handlers());
    expect(receiptsOf()).toEqual({ deliveredSeq: 9, readSeq: 9 });
  });

  it('a subscription without receipts (older API) leaves the state alone', () => {
    applyConversationEvent(C, { type: 'receipts', receipts: { deliveredSeq: 3, readSeq: 2 } }, handlers());
    applyConversationEvent(C, { type: 'subscribed', lastSeq: 3, receipts: null }, handlers());
    expect(receiptsOf()).toEqual({ deliveredSeq: 3, readSeq: 2 });
  });

  it('updates the inbox row’s receipts from live events', () => {
    queryClient.setQueryData<InboxEntry[]>(keys.inbox, [entry(C), entry('other')]);
    applyInboxEvent(C, { type: 'receipts', receipts: { deliveredSeq: 5, readSeq: 5 } });
    const [row, other] = queryClient.getQueryData<InboxEntry[]>(keys.inbox)!;
    expect(row.receipts).toEqual({ deliveredSeq: 5, readSeq: 5 });
    expect(other.receipts).toBeNull();
    expect(receiptsOf()).toEqual({ deliveredSeq: 5, readSeq: 5 });
  });

  it('forgets the receipts when the membership ends', () => {
    const h = handlers();
    applyConversationEvent(C, { type: 'receipts', receipts: { deliveredSeq: 3, readSeq: 2 } }, h);
    applyConversationEvent(C, { type: 'ended' }, h);
    expect(receiptsOf()).toBeUndefined();
    expect(h.onLostAccess).toHaveBeenCalled();
  });

  it('keeps live messages, typing and deletion working alongside receipts', () => {
    const h = handlers();
    queryClient.setQueryData(keys.messages(C), { pages: [page([message(5)], null)], pageParams: [null] });
    applyConversationEvent(C, { type: 'message', message: message(6) }, h);
    applyConversationEvent(C, { type: 'message', message: message(6) }, h);
    applyConversationEvent(C, { type: 'deleted', messageId: 'm5' }, h);
    applyConversationEvent(C, { type: 'typing', communityId: C, names: ['Ada'] }, h);
    const items = queryClient.getQueryData<{ pages: MessagePage[] }>(keys.messages(C))!.pages[0].items;
    expect(items.map((m) => m.seq)).toEqual([6, 5]);
    expect(items[1].deletedAt).not.toBeNull();
    expect(h.onTyping).toHaveBeenCalledWith(['Ada']);
  });
});
