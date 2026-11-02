import { isKinnocUrl, normalizeDeepLinkTarget, parseDeepLink } from '../deepLinks';

describe('normalizeDeepLinkTarget', () => {
  describe('community routes', () => {
    it('normalizes full web community URLs with query parameters', () => {
      expect(
        normalizeDeepLinkTarget('https://web.kinnoc.app/community/caleb?messageId=15d2764e-8c56-4544-b533-94432f513e6d')
      ).toBe('/community/caleb?messageId=15d2764e-8c56-4544-b533-94432f513e6d');
    });

    it('normalizes legacy /communities/:ref/chat routes', () => {
      expect(normalizeDeepLinkTarget('https://kinnoc.app/communities/tech/chat')).toBe('/community/tech');
      expect(normalizeDeepLinkTarget('/communities/tech/chat?messageId=xyz')).toBe('/community/tech?messageId=xyz');
    });

    it('normalizes community requests to /manage', () => {
      expect(normalizeDeepLinkTarget('kinnoc://communities/designers/requests')).toBe('/community/designers/manage');
    });

    it('normalizes short community path /c/:ref', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/c/founders')).toBe('/community/founders');
    });
  });

  describe('post routes', () => {
    it('normalizes /post/:id directly', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/post/post-123')).toBe('/post/post-123');
    });

    it('normalizes legacy /posts/:id and /p/:id', () => {
      expect(normalizeDeepLinkTarget('https://kinnoc.app/posts/post-123')).toBe('/post/post-123');
      expect(normalizeDeepLinkTarget('kinnoc://p/post-123')).toBe('/post/post-123');
    });

    it('normalizes legacy /feed?postId=:id to /post/:id', () => {
      expect(normalizeDeepLinkTarget('/feed?postId=post-123')).toBe('/post/post-123');
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/feed?ref=email&postId=post-456')).toBe('/post/post-456');
    });
  });

  describe('profile routes', () => {
    it('normalizes /profile/:username directly', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/profile/johndoe')).toBe('/profile/johndoe');
    });

    it('normalizes /u/:username and /user/:username', () => {
      expect(normalizeDeepLinkTarget('https://kinnoc.app/u/johndoe')).toBe('/profile/johndoe');
      expect(normalizeDeepLinkTarget('kinnoc://user/johndoe')).toBe('/profile/johndoe');
    });
  });

  describe('event and discover routes', () => {
    it('normalizes /events/:slug and /event/:slug', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/events/tech-summit-2026')).toBe('/events/tech-summit-2026');
      expect(normalizeDeepLinkTarget('kinnoc://event/tech-summit-2026')).toBe('/events/tech-summit-2026');
    });
  });

  describe('invite routes', () => {
    it('normalizes /invite/:code and /invitation/:code', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/invite/welcome123')).toBe('/invite/welcome123');
      expect(normalizeDeepLinkTarget('kinnoc://invitation/welcome123')).toBe('/invite/welcome123');
    });
  });

  describe('notification and setting routes', () => {
    it('normalizes /notifications', () => {
      expect(normalizeDeepLinkTarget('https://web.kinnoc.app/notifications')).toBe('/notifications');
      expect(normalizeDeepLinkTarget('kinnoc://notifications')).toBe('/notifications');
    });

    it('normalizes /settings/verification to /settings', () => {
      expect(normalizeDeepLinkTarget('/settings/verification')).toBe('/settings');
    });

    it('falls back safely for null, undefined, and feed', () => {
      expect(normalizeDeepLinkTarget(null)).toBe('/');
      expect(normalizeDeepLinkTarget(undefined)).toBe('/');
      expect(normalizeDeepLinkTarget('/feed')).toBe('/');
    });
  });
});

describe('parseDeepLink', () => {
  it('correctly parses structured links by type and identifier', () => {
    expect(parseDeepLink('https://web.kinnoc.app/community/music')).toEqual({
      type: 'community',
      identifier: 'music',
      normalizedPath: '/community/music',
    });

    expect(parseDeepLink('https://web.kinnoc.app/post/post-789')).toEqual({
      type: 'post',
      identifier: 'post-789',
      normalizedPath: '/post/post-789',
    });

    expect(parseDeepLink('https://web.kinnoc.app/profile/alice')).toEqual({
      type: 'profile',
      identifier: 'alice',
      normalizedPath: '/profile/alice',
    });

    expect(parseDeepLink('https://web.kinnoc.app/events/hackathon')).toEqual({
      type: 'event',
      identifier: 'hackathon',
      normalizedPath: '/events/hackathon',
    });

    expect(parseDeepLink('https://web.kinnoc.app/invite/club456')).toEqual({
      type: 'invite',
      identifier: 'club456',
      normalizedPath: '/invite/club456',
    });

    expect(parseDeepLink('https://web.kinnoc.app/notifications')).toEqual({
      type: 'notifications',
      normalizedPath: '/notifications',
    });

    expect(parseDeepLink('https://google.com/search')).toEqual({
      type: 'unknown',
      normalizedPath: '/search',
    });
  });
});

describe('isKinnocUrl', () => {
  it('recognizes relative routes', () => {
    expect(isKinnocUrl('/community/123')).toBe(true);
    expect(isKinnocUrl('/post/456')).toBe(true);
  });

  it('recognizes kinnoc:// scheme', () => {
    expect(isKinnocUrl('kinnoc://community/123')).toBe(true);
  });

  it('recognizes kinnoc.app and web.kinnoc.app hosts', () => {
    expect(isKinnocUrl('https://web.kinnoc.app/community/123')).toBe(true);
    expect(isKinnocUrl('https://kinnoc.app/invite/xyz')).toBe(true);
  });

  it('rejects external URLs', () => {
    expect(isKinnocUrl('https://google.com')).toBe(false);
    expect(isKinnocUrl('https://github.com/expo/expo')).toBe(false);
  });
});

