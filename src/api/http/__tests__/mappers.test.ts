import { apiComment, apiCommunity, apiEvent, apiMessage, apiPost } from '../__fixtures__/payloads';
import { type ApiEvent, monogramFor, toComment, toCommunity, toCommunityBody, toEvent, toEventPage, toInboxEntry, toMessage, toPost, toReceipts } from '../mappers';

describe('toCommunity', () => {
  it('maps visibility, policy and category', () => {
    const c = toCommunity(apiCommunity({ visibility: 'UNLISTED', joinPolicy: 'APPROVAL' }));
    expect(c).toMatchObject({
      name: 'Design Lab',
      slug: 'design-lab',
      monogram: 'DL',
      visibility: 'unlisted',
      joinPolicy: 'approval',
      category: 'Design',
      categorySlug: 'design',
      membership: 'none',
      role: null,
      pinned: null,
      rules: [],
    });
  });

  it('maps the viewer membership and only keeps a role for active members', () => {
    expect(toCommunity(apiCommunity({ membership: { status: 'ACTIVE', role: 'MODERATOR', joinedAt: '2026-10-24T10:00:00.000Z' } }))).toMatchObject({
      membership: 'member',
      role: 'moderator',
    });
    expect(toCommunity(apiCommunity({ membership: { status: 'REQUESTED', role: null, joinedAt: null } }))).toMatchObject({ membership: 'pending', role: null });
    expect(toCommunity(apiCommunity({ membership: { status: 'INVITED', role: null, joinedAt: null } }))).toMatchObject({ membership: 'invited', role: null });
  });
});

describe('toCommunityBody', () => {
  it('sends API enums and only the fields given', () => {
    expect(toCommunityBody({ visibility: 'private', joinPolicy: 'invite-only' })).toEqual({ visibility: 'PRIVATE', joinPolicy: 'INVITE_ONLY' });
    expect(toCommunityBody({ avatarKey: null })).toEqual({ avatarKey: null });
    expect(toCommunityBody({})).toEqual({});
  });
});

describe('toMessage', () => {
  it('maps a message as sent, with no reactions or attachments', () => {
    expect(toMessage(apiMessage())).toMatchObject({ seq: 7, text: 'Hello', status: 'sent', attachments: [], reactions: [], deletedAt: null });
  });

  it('keeps deleted messages in place without text', () => {
    const m = toMessage(apiMessage({ text: null, deletedAt: '2026-10-24T11:00:00.000Z' }));
    expect(m.text).toBe('');
    expect(m.deletedAt).toBe('2026-10-24T11:00:00.000Z');
  });

  it('handles deleted accounts and deleted reply targets', () => {
    const m = toMessage(apiMessage({ sender: null, replyTo: { id: 'r1', senderName: null, text: null } }));
    expect(m.sender).toBeNull();
    expect(m.replyTo).toEqual({ id: 'r1', senderName: 'Former member', text: 'Deleted message' });
  });
});

describe('toInboxEntry', () => {
  it('shows "You" for your own last message and the first name otherwise', () => {
    const community = apiCommunity({ membership: { status: 'ACTIVE', role: 'MEMBER', joinedAt: '2026-10-24T10:00:00.000Z' } });
    expect(toInboxEntry({ community, lastMessage: apiMessage(), unreadCount: 3 }).lastMessage?.senderName).toBe('Ada');
    expect(toInboxEntry({ community, lastMessage: apiMessage({ isMine: true }), unreadCount: 0 }).lastMessage?.senderName).toBe('You');
    expect(toInboxEntry({ community, lastMessage: null, unreadCount: 0 })).toMatchObject({ lastMessage: null, isMuted: false, isPinned: false });
  });

  it('keeps the conversation’s receipts and the last message’s position', () => {
    const community = apiCommunity();
    const entry = toInboxEntry({ community, lastMessage: apiMessage({ seq: 9, isMine: true }), unreadCount: 0, receipts: { deliveredSeq: 9, readSeq: 8 } });
    expect(entry).toMatchObject({ receipts: { deliveredSeq: 9, readSeq: 8 }, lastMessage: { seq: 9, isMine: true } });
    expect(toInboxEntry({ community, lastMessage: null, unreadCount: 0 }).receipts).toBeNull();
  });
});

describe('toReceipts', () => {
  it('accepts whole, non-negative positions only', () => {
    expect(toReceipts({ deliveredSeq: 4, readSeq: 0 })).toEqual({ deliveredSeq: 4, readSeq: 0 });
    expect(toReceipts(undefined)).toBeNull();
    expect(toReceipts(null)).toBeNull();
    expect(toReceipts({ deliveredSeq: -1, readSeq: 0 })).toBeNull();
    expect(toReceipts({ deliveredSeq: '4', readSeq: 1 } as never)).toBeNull();
  });
});

describe('toPost', () => {
  it('maps author, community, images, link and counts', () => {
    expect(toPost(apiPost())).toEqual({
      kind: 'post',
      id: apiPost().id,
      author: { id: 'ada', username: 'ada', displayName: 'Ada Lovelace', avatarUrl: null },
      community: { id: '0b0f4f5e-6d43-4a39-9f0e-1f8b9d6a0c11', name: 'Design Lab' },
      text: "We're hiring a designer.",
      media: [
        {
          id: apiPost().media[0].url,
          kind: 'image',
          url: apiPost().media[0].url,
          width: 1600,
          height: 900,
          alt: 'Our office',
        },
      ],
      link: { url: 'https://kinnoc.com/jobs/42', domain: 'kinnoc.com' },
      createdAt: '2026-10-25T09:00:00.000Z',
      editedAt: null,
      likeCount: 12,
      commentCount: 3,
      likedByMe: false,
      isMine: false,
      savedByMe: false,
      topReply: null,
    });
  });

  it('handles general posts and images without a size', () => {
    const post = toPost(apiPost({ community: null, link: null, media: [{ url: 'u', mimeType: 'image/png', width: null, height: null, alt: null }] }));
    expect(post.community).toBeNull();
    expect(post.link).toBeNull();
    expect(post.media[0]).toMatchObject({ width: 0, height: 0, alt: undefined });
  });
});

describe('toComment', () => {
  it('maps comments, replies and deleted placeholders', () => {
    expect(toComment(apiComment())).toMatchObject({ parentId: null, author: { username: 'grace' }, text: 'Applied!', replyCount: 2 });
    expect(toComment(apiComment({ parentId: 'c0', replyCount: 0 }))).toMatchObject({ parentId: 'c0' });
    expect(toComment(apiComment({ author: null, text: null, deletedAt: '2026-10-25T10:00:00.000Z' }))).toMatchObject({
      author: null,
      text: '',
      deletedAt: '2026-10-25T10:00:00.000Z',
    });
  });
});

describe('monogramFor', () => {
  it('takes up to two initials', () => {
    expect(monogramFor('Design Lab Lagos')).toBe('DL');
    expect(monogramFor('uniosun')).toBe('U');
    expect(monogramFor('  ')).toBe('#');
    expect(monogramFor('Ọ̀rẹ́ Club')).toBe('ỌC');
  });
});

describe('toEvent', () => {
  it('maps a published in-person event', () => {
    expect(toEvent(apiEvent())).toEqual({
      kind: 'event',
      id: 'bb61fe0e-0436-414c-bd03-cea100c76ae8',
      title: 'testing',
      summary: 'hello, testing',
      description: "hello testing events to ensure it's works",
      coverUrl: 'https://x.supabase.co/storage/v1/object/public/event-media/a/poster.png',
      savedByMe: false,
      externalUrl: 'https://kinnoc-web-admin.vercel.app/events/new',
      startsAt: '2026-10-31T21:48:00.000Z',
      endsAt: '2026-11-01T09:48:00.000Z',
      timeZone: 'Africa/Lagos',
      venue: 'osogbo, Badagry',
      address: 'uniosun, Badagry, Lagos, NI',
      isOnline: false,
      onlineUrl: null,
      host: 'caleb',
      hostLogoUrl: 'https://x.supabase.co/storage/v1/object/public/event-media/a/logo.jpg',
      category: 'Conference',
      tags: ['tech'],
      price: { amount: 100000, currency: 'NGN' },
      capacity: 200,
      registrationDeadline: '2026-10-30T09:48:00.000Z',
      status: 'scheduled',
      cancellationReason: null,
      isPast: false,
    });
  });

  it('maps online and cancelled events, and an unpriced event', () => {
    const online = toEvent(apiEvent({ isOnline: true, venueName: null, onlineEventUrl: 'https://meet.example.com/x', priceAmount: null, currency: null }))!;
    expect(online).toMatchObject({ venue: 'Online', address: null, onlineUrl: 'https://meet.example.com/x', price: null });
    const cancelled = toEvent(apiEvent({ status: 'CANCELLED', cancellationReason: 'Venue flooded' }))!;
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Venue flooded' });
    expect(toEvent(apiEvent({ priceAmount: 0 }))!.price).toEqual({ amount: 0, currency: 'NGN' });
  });

  it('copes with optional fields left out', () => {
    const sparse = toEvent({ id: 'e1', title: ' Talk ', startAt: '2026-11-21T08:00:00.000Z' } as ApiEvent)!;
    expect(sparse).toMatchObject({
      title: 'Talk',
      summary: '',
      description: null,
      coverUrl: null,
      endsAt: null,
      timeZone: null,
      venue: 'Venue to be announced',
      host: 'Kinnoc',
      tags: [],
      price: null,
      status: 'scheduled',
      isPast: false,
    });
  });

  it('drops a poster or link that is not an https URL', () => {
    const e = toEvent(apiEvent({ coverImageUrl: 'not a url', registrationUrl: 'javascript:alert(1)', endAt: 'soon' }))!;
    expect(e).toMatchObject({ coverUrl: null, externalUrl: null, endsAt: null });
  });

  it('skips malformed records instead of failing the page', () => {
    const page = toEventPage({ items: [apiEvent(), { id: 'x' } as ApiEvent, apiEvent({ id: 'e2', startAt: 'never' }), null as unknown as ApiEvent], nextCursor: 'c2' });
    expect(page.items.map((e) => e.id)).toEqual(['bb61fe0e-0436-414c-bd03-cea100c76ae8']);
    expect(page.nextCursor).toBe('c2');
    expect(toEventPage({} as never)).toEqual({ items: [], nextCursor: null });
  });
});
