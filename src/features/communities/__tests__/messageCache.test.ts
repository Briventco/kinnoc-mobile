import type { Message } from '@/api/types';

import { markDeleted, maxSeq, mergeMessages, type MessagePages } from '../messageCache';

const msg = (over: Partial<Message> & { id: string }): Message => ({
  clientId: null,
  communityId: 'c1',
  seq: null,
  sender: { username: 'ada', displayName: 'Ada', avatarUrl: null },
  isMine: false,
  text: over.id,
  sentAt: '2026-10-24T10:00:00.000Z',
  deletedAt: null,
  replyTo: null,
  attachments: [],
  link: null,
  reactions: [],
  status: 'sent',
  ...over,
});

const pages = (...lists: Message[][]): MessagePages => ({
  pages: lists.map((items, i) => ({ items, nextCursor: i < lists.length - 1 ? `p${i + 1}` : null })),
  pageParams: lists.map((_, i) => (i ? `p${i}` : null)),
});

const ids = (d: MessagePages | undefined) => d?.pages.map((p) => p.items.map((m) => m.id));

describe('mergeMessages', () => {
  const history = pages([msg({ id: 'm3', seq: 3 }), msg({ id: 'm2', seq: 2 })], [msg({ id: 'm1', seq: 1 })]);

  it('adds new messages to the newest page in seq order', () => {
    const merged = mergeMessages(history, [msg({ id: 'm5', seq: 5 }), msg({ id: 'm4', seq: 4 })]);
    expect(ids(merged)).toEqual([['m5', 'm4', 'm3', 'm2'], ['m1']]);
  });

  it('ignores a message it already has (live event and catch-up overlap)', () => {
    const once = mergeMessages(history, [msg({ id: 'm4', seq: 4 })]);
    const twice = mergeMessages(once, [msg({ id: 'm4', seq: 4 }), msg({ id: 'm4', seq: 4 })]);
    expect(ids(twice)).toEqual([['m4', 'm3', 'm2'], ['m1']]);
  });

  it('turns an optimistic bubble into the server copy by client ID', () => {
    const pending = msg({ id: 'k1', clientId: 'k1', isMine: true, status: 'sending' });
    const withPending = mergeMessages(history, [pending]);
    expect(ids(withPending)?.[0]).toEqual(['k1', 'm3', 'm2']);
    const confirmed = mergeMessages(withPending, [msg({ id: 'm4', clientId: 'k1', isMine: true, seq: 4 })]);
    expect(ids(confirmed)?.[0]).toEqual(['m4', 'm3', 'm2']);
    expect(confirmed?.pages[0].items[0].status).toBe('sent');
  });

  it('reconciles optimistic bubble from live WebSocket event without isMine and preserves isMine: true', () => {
    const pending = msg({ id: 'k2', clientId: 'k2', isMine: true, status: 'sending' });
    const withPending = mergeMessages(history, [pending]);
    // WebSocket broadcast payload does not carry isMine: true
    const wsEventMessage = msg({ id: 'm5', clientId: 'k2', isMine: false, seq: 5 });
    const confirmed = mergeMessages(withPending, [wsEventMessage]);
    expect(ids(confirmed)?.[0]).toEqual(['m5', 'm3', 'm2']);
    expect(confirmed?.pages[0].items[0].isMine).toBe(true);
    expect(confirmed?.pages[0].items[0].status).toBe('sent');
  });

  it('handles multiple in-flight optimistic messages and reconciles each independently', () => {
    const pending1 = msg({ id: 'k1', clientId: 'k1', isMine: true, status: 'sending', sentAt: '2026-10-24T10:01:00.000Z' });
    const pending2 = msg({ id: 'k2', clientId: 'k2', isMine: true, status: 'sending', sentAt: '2026-10-24T10:02:00.000Z' });
    const withBoth = mergeMessages(history, [pending1, pending2]);
    expect(ids(withBoth)?.[0]).toEqual(['k2', 'k1', 'm3', 'm2']);

    // Server acknowledges k1 first
    const confirmed1 = mergeMessages(withBoth, [msg({ id: 'm4', clientId: 'k1', seq: 4 })]);
    expect(ids(confirmed1)?.[0]).toEqual(['k2', 'm4', 'm3', 'm2']);

    // Server acknowledges k2 second
    const confirmed2 = mergeMessages(confirmed1, [msg({ id: 'm5', clientId: 'k2', seq: 5 })]);
    expect(ids(confirmed2)?.[0]).toEqual(['m5', 'm4', 'm3', 'm2']);
  });

  it('keeps unsent messages above everything the server has', () => {
    const merged = mergeMessages(history, [msg({ id: 'k1', clientId: 'k1', isMine: true, status: 'failed' }), msg({ id: 'm4', seq: 4 })]);
    expect(ids(merged)?.[0]).toEqual(['k1', 'm4', 'm3', 'm2']);
  });

  it('does not bring a deleted message back from an older copy', () => {
    const deleted = markDeleted(history, 'm3', '2026-10-24T11:00:00.000Z');
    const merged = mergeMessages(deleted, [msg({ id: 'm3', seq: 3 })]);
    expect(merged?.pages[0].items[0]).toMatchObject({ id: 'm3', text: '', deletedAt: '2026-10-24T11:00:00.000Z' });
  });

  it('leaves an empty cache alone', () => {
    expect(mergeMessages(undefined, [msg({ id: 'm1', seq: 1 })])).toBeUndefined();
  });
});

describe('maxSeq', () => {
  it('finds the newest server sequence number, ignoring unsent messages', () => {
    expect(maxSeq(pages([msg({ id: 'k', seq: null }), msg({ id: 'm2', seq: 2 })], [msg({ id: 'm1', seq: 1 })]))).toBe(2);
    expect(maxSeq(pages([]))).toBeNull();
  });
});
