/**
 * Universal Deep Link Normalization and Routing for Kinnoc.
 * Resolves web URLs (https://web.kinnoc.app, https://kinnoc.app), custom schemes (kinnoc://),
 * notification targets, and relative routes to canonical Expo Router paths.
 */

export const SUPPORTED_DEEP_LINK_TYPES = [
  'community',
  'post',
  'profile',
  'event',
  'notifications',
  'invite',
  'feedback',
] as const;

export type DeepLinkType = (typeof SUPPORTED_DEEP_LINK_TYPES)[number];

export interface ParsedDeepLink {
  type: DeepLinkType | 'unknown';
  identifier?: string;
  normalizedPath: string;
}

/**
 * Checks if a string or URL belongs to Kinnoc (custom scheme kinnoc://, relative path, or kinnoc domain).
 */
export function isKinnocUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('kinnoc://') || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) return true;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'kinnoc.app' ||
      host === 'web.kinnoc.app' ||
      host === 'kinnoc.com' ||
      host === 'web.kinnoc.com' ||
      host.endsWith('.kinnoc.app')
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes any incoming deep link or web URL into a canonical Expo Router destination.
 */
export function normalizeDeepLinkTarget(targetUrl?: string | null): string {
  if (!targetUrl) return '/';
  let url = targetUrl.trim();

  // Strip protocol and domain if a full URL was passed (e.g. https://... or kinnoc://...)
  try {
    if (url.startsWith('kinnoc://')) {
      url = url.replace(/^kinnoc:\/\//, '/');
    } else if (url.includes('://')) {
      const parsed = new URL(url);
      url = parsed.pathname + parsed.search;
    }
  } catch {
    // Keep raw string if parsing fails
  }

  // 1. Community routes
  // /communities/:ref/chat -> /community/:ref
  const communityChatMatch = url.match(/^\/communities\/([^/?#]+)\/chat(?:\?(.*))?$/);
  if (communityChatMatch) {
    const [, ref, query] = communityChatMatch;
    return query ? `/community/${ref}?${query}` : `/community/${ref}`;
  }

  // /communities/:ref/requests -> /community/:ref/manage
  const communityRequestsMatch = url.match(/^\/communities\/([^/?#]+)\/requests(?:\?(.*))?$/);
  if (communityRequestsMatch) {
    const [, ref] = communityRequestsMatch;
    return `/community/${ref}/manage`;
  }

  // /communities/:ref -> /community/:ref
  const communityMatch = url.match(/^\/communities\/([^/?#]+)(?:\?(.*))?$/);
  if (communityMatch) {
    const [, ref, query] = communityMatch;
    return query ? `/community/${ref}?${query}` : `/community/${ref}`;
  }

  // /c/:ref -> /community/:ref
  const shortCommunityMatch = url.match(/^\/c\/([^/?#]+)(?:\?(.*))?$/);
  if (shortCommunityMatch) {
    const [, ref, query] = shortCommunityMatch;
    return query ? `/community/${ref}?${query}` : `/community/${ref}`;
  }

  // 2. Post routes
  // /feed?postId=:id -> /post/:id
  const feedPostMatch = url.match(/^\/feed\?.*postId=([^&#]+)/);
  if (feedPostMatch) {
    return `/post/${feedPostMatch[1]}`;
  }

  // /posts/:id -> /post/:id or /p/:id -> /post/:id
  const postsMatch = url.match(/^\/(?:posts|p)\/([^/?#]+)(?:\?(.*))?$/);
  if (postsMatch) {
    const [, id, query] = postsMatch;
    return query ? `/post/${id}?${query}` : `/post/${id}`;
  }

  // 3. Profile routes
  // /u/:username or /user/:username -> /profile/:username
  const userMatch = url.match(/^\/(?:u|user)\/([^/?#]+)(?:\?(.*))?$/);
  if (userMatch) {
    const [, username, query] = userMatch;
    return query ? `/profile/${username}?${query}` : `/profile/${username}`;
  }

  // 4. Events routes
  // /event/:slug -> /events/:slug
  const singleEventMatch = url.match(/^\/event\/([^/?#]+)(?:\?(.*))?$/);
  if (singleEventMatch) {
    const [, slug, query] = singleEventMatch;
    return query ? `/events/${slug}?${query}` : `/events/${slug}`;
  }

  // 5. Invitation routes
  // /invitation/:code -> /invite/:code
  const invitationMatch = url.match(/^\/invitation\/([^/?#]+)(?:\?(.*))?$/);
  if (invitationMatch) {
    const [, code, query] = invitationMatch;
    return query ? `/invite/${code}?${query}` : `/invite/${code}`;
  }

  // 6. Generic feeds & settings redirects
  if (url === '/feed' || url.startsWith('/feed?')) {
    return '/';
  }
  if (url.startsWith('/settings/verification')) {
    return '/settings';
  }

  return url;
}

/**
 * Parses a deep link into its type and identifier for structured navigation.
 */
export function parseDeepLink(url?: string | null): ParsedDeepLink {
  const normalizedPath = normalizeDeepLinkTarget(url);
  const pathOnly = normalizedPath.split('?')[0];

  const communityMatch = pathOnly.match(/^\/community\/([^/]+)/);
  if (communityMatch) {
    return { type: 'community', identifier: communityMatch[1], normalizedPath };
  }

  const postMatch = pathOnly.match(/^\/post\/([^/]+)/);
  if (postMatch) {
    return { type: 'post', identifier: postMatch[1], normalizedPath };
  }

  const profileMatch = pathOnly.match(/^\/profile\/([^/]+)/);
  if (profileMatch) {
    return { type: 'profile', identifier: profileMatch[1], normalizedPath };
  }

  const eventMatch = pathOnly.match(/^\/(?:events|discover)\/([^/]+)/);
  if (eventMatch) {
    return { type: 'event', identifier: eventMatch[1], normalizedPath };
  }

  const inviteMatch = pathOnly.match(/^\/invite\/([^/]+)/);
  if (inviteMatch) {
    return { type: 'invite', identifier: inviteMatch[1], normalizedPath };
  }

  // Only the sender's own feedback: the screen itself enforces that, behind sign-in.
  const feedbackMatch = pathOnly.match(/^\/feedback\/([^/]+)$/);
  if (feedbackMatch && feedbackMatch[1] !== 'new' && feedbackMatch[1] !== 'history') {
    return { type: 'feedback', identifier: feedbackMatch[1], normalizedPath };
  }

  if (pathOnly === '/notifications') {
    return { type: 'notifications', normalizedPath };
  }

  return { type: 'unknown', normalizedPath };
}

/** Routes that only make sense signed out; a link to one is never kept for after sign-in. */
const SIGNED_OUT_ROUTES = ['/(auth)', '/welcome', '/sign-in', '/sign-up', '/onboarding'];

/**
 * Where an incoming link (deep link, universal link, notification) should land once the user is
 * signed in, or null when there is nothing worth keeping (home, or a signed-out screen). Used to
 * preserve a destination such as `/feedback/<id>` through sign-in.
 */
export function destinationAfterSignIn(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const normalized = normalizeDeepLinkTarget(rawUrl);
  if (!normalized || normalized === '/' || SIGNED_OUT_ROUTES.some((r) => normalized.startsWith(r))) return null;
  return normalized;
}
