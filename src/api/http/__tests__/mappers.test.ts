import { apiCommunity, apiMessage } from '../__fixtures__/payloads';
import { monogramFor, toCommunity, toCommunityBody, toInboxEntry, toMessage } from '../mappers';

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
});

describe('monogramFor', () => {
  it('takes up to two initials', () => {
    expect(monogramFor('Design Lab Lagos')).toBe('DL');
    expect(monogramFor('uniosun')).toBe('U');
    expect(monogramFor('  ')).toBe('#');
    expect(monogramFor('Ọ̀rẹ́ Club')).toBe('ỌC');
  });
});
