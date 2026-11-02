import { Platform, Share } from 'react-native';

export const WEB_APP_URL = 'https://web.kinnoc.app';

/**
 * Returns the canonical web URL for a given relative path.
 * In a browser, uses the current origin when available; otherwise defaults to https://web.kinnoc.app.
 */
export function getCanonicalUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${cleanPath}`;
  }
  return `${WEB_APP_URL}${cleanPath}`;
}

/**
 * Builds canonical HTTP web links for the supported Kinnoc entities.
 */
export function buildDeepLinkUrl(
  type: 'community' | 'post' | 'profile' | 'event' | 'invite',
  identifier: string,
): string {
  switch (type) {
    case 'community':
      return getCanonicalUrl(`/community/${encodeURIComponent(identifier)}`);
    case 'post':
      return getCanonicalUrl(`/post/${encodeURIComponent(identifier)}`);
    case 'profile':
      return getCanonicalUrl(`/profile/${encodeURIComponent(identifier)}`);
    case 'event':
      return getCanonicalUrl(`/events/${encodeURIComponent(identifier)}`);
    case 'invite':
      return getCanonicalUrl(`/invite/${encodeURIComponent(identifier)}`);
  }
}

/**
 * Shares a community link with canonical formatting.
 */
export async function shareCommunity(community: {
  id: string;
  name: string;
  slug?: string;
  description?: string;
}): Promise<void> {
  const ref = community.slug || community.id;
  const url = buildDeepLinkUrl('community', ref);
  await Share.share({
    title: community.name,
    message: `Join ${community.name} on Kinnoc: ${url}`,
    url,
  });
}

/**
 * Shares a feed post link with author snippet.
 */
export async function sharePost(post: {
  id: string;
  text?: string;
  author: { displayName: string };
}): Promise<void> {
  const url = buildDeepLinkUrl('post', post.id);
  const snippet = post.text
    ? post.text.length > 80
      ? `${post.text.slice(0, 77)}…`
      : post.text
    : 'a post';
  await Share.share({
    title: `Post by ${post.author.displayName}`,
    message: `${post.author.displayName} on Kinnoc: "${snippet}" — ${url}`,
    url,
  });
}

/**
 * Shares a public profile link.
 */
export async function shareProfile(profile: {
  username: string;
  displayName?: string;
}): Promise<void> {
  const url = buildDeepLinkUrl('profile', profile.username);
  const name = profile.displayName ? `${profile.displayName} (@${profile.username})` : `@${profile.username}`;
  await Share.share({
    title: name,
    message: `${name} on Kinnoc: ${url}`,
    url,
  });
}

/**
 * Shares an event link.
 */
export async function shareEvent(event: {
  id: string;
  title: string;
  slug?: string;
}): Promise<void> {
  const ref = event.slug || event.id;
  const url = buildDeepLinkUrl('event', ref);
  await Share.share({
    title: event.title,
    message: `${event.title} on Kinnoc: ${url}`,
    url,
  });
}

/**
 * Shares a community invitation link.
 */
export async function shareInvite(
  codeOrOptions: string | { code: string; communityName?: string },
  maybeCommunityName?: string,
): Promise<void> {
  const code = typeof codeOrOptions === 'string' ? codeOrOptions : codeOrOptions.code;
  const communityName = typeof codeOrOptions === 'string' ? maybeCommunityName : codeOrOptions.communityName;
  const url = buildDeepLinkUrl('invite', code);
  const target = communityName ? `join ${communityName}` : 'join our community';
  const title = communityName ? `Invitation to ${communityName}` : 'Kinnoc Invitation';
  await Share.share({
    title,
    message: `You're invited to ${target} on Kinnoc: ${url}`,
    url,
  });
}
