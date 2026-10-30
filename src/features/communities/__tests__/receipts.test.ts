import type { Message } from '@/api/types';

import { deliveryStatus, mergeReceipts, statusForSeq } from '../receipts';

const mine = (over: Partial<Message> = {}): Message => ({
  id: 'm10',
  clientId: 'k10',
  communityId: 'c1',
  seq: 10,
  sender: { username: 'me', displayName: 'Me', avatarUrl: null },
  isMine: true,
  text: 'Hi',
  sentAt: '2026-10-25T10:00:00.000Z',
  deletedAt: null,
  replyTo: null,
  attachments: [],
  link: null,
  reactions: [],
  status: 'sent',
  ...over,
});

describe('statusForSeq', () => {
  const receipts = { deliveredSeq: 10, readSeq: 8 };

  it('is Seen up to and including readSeq', () => {
    expect(statusForSeq(7, receipts)).toBe('read');
    expect(statusForSeq(8, receipts)).toBe('read');
  });

  it('is Delivered after readSeq, up to and including deliveredSeq', () => {
    expect(statusForSeq(9, receipts)).toBe('delivered');
    expect(statusForSeq(10, receipts)).toBe('delivered');
  });

  it('is Sent after deliveredSeq', () => {
    expect(statusForSeq(11, receipts)).toBe('sent');
  });

  it('is Sent while the community has fewer than two members (both positions 0)', () => {
    expect(statusForSeq(1, { deliveredSeq: 0, readSeq: 0 })).toBe('sent');
  });

  it('falls back to one tick without receipts', () => {
    expect(statusForSeq(1, null)).toBe('sent');
    expect(statusForSeq(1, undefined)).toBe('sent');
  });
});

describe('deliveryStatus', () => {
  const receipts = { deliveredSeq: 10, readSeq: 10 };

  it('applies the receipts to the viewer’s own sent messages', () => {
    expect(deliveryStatus(mine({ seq: 10 }), receipts)).toBe('read');
    expect(deliveryStatus(mine({ seq: 11 }), receipts)).toBe('sent');
  });

  it('keeps sending and failed states, and messages not yet numbered by the server', () => {
    expect(deliveryStatus(mine({ seq: null, status: 'sending' }), receipts)).toBe('sending');
    expect(deliveryStatus(mine({ seq: null, status: 'failed' }), receipts)).toBe('failed');
  });

  it('never applies the receipts to other people’s messages', () => {
    expect(deliveryStatus(mine({ isMine: false, seq: 3 }), receipts)).toBe('sent');
  });

  it('falls back to the message’s own status (one tick for a server copy) without receipts', () => {
    expect(deliveryStatus(mine(), null)).toBe('sent');
  });
});

describe('mergeReceipts', () => {
  it('takes the first receipts and ignores missing ones', () => {
    expect(mergeReceipts(null, { deliveredSeq: 3, readSeq: 1 })).toEqual({ deliveredSeq: 3, readSeq: 1 });
    expect(mergeReceipts({ deliveredSeq: 3, readSeq: 1 }, null)).toEqual({ deliveredSeq: 3, readSeq: 1 });
    expect(mergeReceipts(undefined, undefined)).toBeNull();
  });

  it('keeps each position at its highest, so a stale page cannot move ticks back', () => {
    expect(mergeReceipts({ deliveredSeq: 9, readSeq: 4 }, { deliveredSeq: 7, readSeq: 6 })).toEqual({ deliveredSeq: 9, readSeq: 6 });
  });

  it('returns the same object when nothing changed, so screens do not re-render', () => {
    const current = { deliveredSeq: 9, readSeq: 4 };
    expect(mergeReceipts(current, { deliveredSeq: 9, readSeq: 4 })).toBe(current);
  });
});
