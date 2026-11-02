import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Route alias to handle /events/:slug or /events/:id and redirect seamlessly
 * to the discover detail screen.
 */
export default function EventRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  if (!slug) {
    return <Redirect href="/discover" />;
  }

  return <Redirect href={`/discover/${slug}`} />;
}
