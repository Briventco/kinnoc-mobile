/**
 * Normalizes notification destination URLs to ensure valid Expo Router routes.
 * Handles both new route formats and legacy notification targets stored in the database.
 */
export function normalizeNotificationTarget(targetUrl?: string | null): string {
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

  // 1. /communities/:ref/chat -> /community/:ref
  const communityChatMatch = url.match(/^\/communities\/([^/?#]+)\/chat(?:\?(.*))?$/);
  if (communityChatMatch) {
    const [, ref, query] = communityChatMatch;
    return query ? `/community/${ref}?${query}` : `/community/${ref}`;
  }

  // 2. /communities/:ref/requests -> /community/:ref/manage
  const communityRequestsMatch = url.match(/^\/communities\/([^/?#]+)\/requests(?:\?(.*))?$/);
  if (communityRequestsMatch) {
    const [, ref] = communityRequestsMatch;
    return `/community/${ref}/manage`;
  }

  // 3. /communities/:ref -> /community/:ref
  const communityMatch = url.match(/^\/communities\/([^/?#]+)(?:\?(.*))?$/);
  if (communityMatch) {
    const [, ref, query] = communityMatch;
    return query ? `/community/${ref}?${query}` : `/community/${ref}`;
  }

  // 4. /feed?postId=:id -> /post/:id
  const feedPostMatch = url.match(/^\/feed\?.*postId=([^&#]+)/);
  if (feedPostMatch) {
    return `/post/${feedPostMatch[1]}`;
  }

  // 5. /feed -> /
  if (url === '/feed' || url.startsWith('/feed?')) {
    return '/';
  }

  // 6. /settings/verification -> /settings
  if (url.startsWith('/settings/verification')) {
    return '/settings';
  }

  return url;
}
