import { normalizeNotificationTarget } from '../navigation';

describe('normalizeNotificationTarget', () => {
  it('normalizes legacy chat URLs to singular community path', () => {
    expect(normalizeNotificationTarget('/communities/tech-builders/chat')).toBe('/community/tech-builders');
    expect(normalizeNotificationTarget('/communities/550e8400-e29b-41d4-a716-446655440000/chat')).toBe(
      '/community/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('preserves query parameters such as messageId', () => {
    expect(normalizeNotificationTarget('/communities/tech-builders/chat?messageId=msg-123')).toBe(
      '/community/tech-builders?messageId=msg-123',
    );
    expect(normalizeNotificationTarget('/community/tech-builders?messageId=msg-123')).toBe(
      '/community/tech-builders?messageId=msg-123',
    );
  });

  it('normalizes community requests to manage screen', () => {
    expect(normalizeNotificationTarget('/communities/tech-builders/requests')).toBe('/community/tech-builders/manage');
  });

  it('normalizes plain communities URL to singular community path', () => {
    expect(normalizeNotificationTarget('/communities/designers')).toBe('/community/designers');
  });

  it('normalizes feed post URLs to individual post screen', () => {
    expect(normalizeNotificationTarget('/feed?postId=p-456')).toBe('/post/p-456');
    expect(normalizeNotificationTarget('/feed?scope=for-you&postId=p-789')).toBe('/post/p-789');
  });

  it('normalizes /feed without post id to root feed', () => {
    expect(normalizeNotificationTarget('/feed')).toBe('/');
  });

  it('normalizes /settings/verification to /settings', () => {
    expect(normalizeNotificationTarget('/settings/verification')).toBe('/settings');
  });

  it('handles full web URLs and scheme URLs cleanly', () => {
    expect(normalizeNotificationTarget('https://app.kinnoc.com/communities/tech-builders/chat')).toBe(
      '/community/tech-builders',
    );
    expect(normalizeNotificationTarget('kinnoc://communities/tech-builders/chat?messageId=m-1')).toBe(
      '/community/tech-builders?messageId=m-1',
    );
    expect(normalizeNotificationTarget('https://kinnoc.app/feed?postId=post-99')).toBe('/post/post-99');
  });

  it('handles null, undefined or empty input safely', () => {
    expect(normalizeNotificationTarget(null)).toBe('/');
    expect(normalizeNotificationTarget(undefined)).toBe('/');
    expect(normalizeNotificationTarget('')).toBe('/');
  });

  it('passes through already valid routes unmodified', () => {
    expect(normalizeNotificationTarget('/community/tech-builders')).toBe('/community/tech-builders');
    expect(normalizeNotificationTarget('/post/post-100')).toBe('/post/post-100');
    expect(normalizeNotificationTarget('/settings/notifications')).toBe('/settings/notifications');
  });
});

