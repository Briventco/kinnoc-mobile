import { normalizeNotificationTarget } from '@/features/notifications/navigation';

import { destinationAfterSignIn, normalizeDeepLinkTarget, parseDeepLink } from '../deepLinks';

describe('feedback links', () => {
  it('route a feedback notification straight to the submission', () => {
    expect(normalizeNotificationTarget('/feedback/3f1c0d2e-1111-4000-8000-000000000001')).toBe('/feedback/3f1c0d2e-1111-4000-8000-000000000001');
    expect(normalizeDeepLinkTarget('https://web.kinnoc.app/feedback/fb-1')).toBe('/feedback/fb-1');
    expect(normalizeDeepLinkTarget('kinnoc://feedback/fb-1')).toBe('/feedback/fb-1');
  });

  it('are recognised as feedback, but the form and history are not submissions', () => {
    expect(parseDeepLink('/feedback/fb-1')).toEqual({ type: 'feedback', identifier: 'fb-1', normalizedPath: '/feedback/fb-1' });
    expect(parseDeepLink('/feedback/new').type).toBe('unknown');
    expect(parseDeepLink('/feedback/history').type).toBe('unknown');
  });

  it('are kept through sign-in, from a cold start or a warm link', () => {
    expect(destinationAfterSignIn('https://kinnoc.app/feedback/fb-1')).toBe('/feedback/fb-1');
    expect(destinationAfterSignIn('kinnoc://feedback/fb-1')).toBe('/feedback/fb-1');
  });

  it('never keep home or signed-out screens as a destination', () => {
    expect(destinationAfterSignIn(null)).toBeNull();
    expect(destinationAfterSignIn('https://kinnoc.app/')).toBeNull();
    expect(destinationAfterSignIn('/sign-in')).toBeNull();
    expect(destinationAfterSignIn('/welcome')).toBeNull();
    expect(destinationAfterSignIn('/onboarding')).toBeNull();
  });
});
