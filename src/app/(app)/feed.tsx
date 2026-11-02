import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Route alias to handle /feed?postId=... or /feed and redirect to the post screen or home feed.
 */
export default function FeedRedirect() {
  const { postId } = useLocalSearchParams<{ postId?: string }>();
  if (postId) {
    return <Redirect href={`/post/${postId}`} />;
  }
  return <Redirect href="/" />;
}

