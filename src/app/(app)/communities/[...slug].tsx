import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Route alias to handle legacy or external /communities/* URLs and redirect
 * seamlessly to the active /community/:id routes without 404.
 */
export default function CommunitiesRedirect() {
  const { slug, messageId } = useLocalSearchParams<{ slug: string[]; messageId?: string }>();
  const communityRef = slug?.[0];
  const subRoute = slug?.[1];

  if (!communityRef) {
    return <Redirect href="/communities" />;
  }

  if (subRoute === 'requests' || subRoute === 'manage') {
    return <Redirect href={`/community/${communityRef}/manage`} />;
  }

  // /communities/:ref/chat or /communities/:ref -> /community/:ref
  const query = messageId ? `?messageId=${encodeURIComponent(messageId)}` : '';
  return <Redirect href={`/community/${communityRef}${query}`} />;
}
