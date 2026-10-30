import { router, useLocalSearchParams } from 'expo-router';
import { SquarePen } from 'lucide-react-native';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isApiError } from '@/api/errors';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { useCommunity } from '@/features/communities/hooks';
import { useCommunityPosts } from '@/features/feed/hooks';
import { PostRow } from '@/features/feed/PostRow';
import { flattenUnique } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors } from '@/theme';

/** One community's posts, newest first. Members post here; members-only communities show posts to members only. */
export default function CommunityPosts() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const posts = useCommunityPosts(id);
  const pull = usePullToRefresh(posts.refetch);
  const items = flattenUnique(posts.data, (p) => p.id);
  const c = community.data;
  const member = c?.membership === 'member';
  const canModerate = c?.role === 'owner' || c?.role === 'moderator';
  const membersOnly = posts.isError && isApiError(posts.error, 'MEMBERSHIP_REQUIRED');

  const write = member ? (
    <IconButton icon={SquarePen} label="New post in this community" onPress={() => router.push({ pathname: '/compose', params: { communityId: id } })} />
  ) : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title={c ? `${c.name} posts` : 'Posts'} right={write} />
      {posts.isPending ? (
        <SkeletonList rows={3} media />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PostRow post={item} canModerate={canModerate} />}
          ItemSeparatorComponent={Hairline}
          ListEmptyComponent={
            membersOnly ? (
              <EmptyState
                title="Posts are for members"
                body="Join this community to see and share its posts."
                action={{ label: 'View community', onPress: () => router.replace({ pathname: '/community/[id]/info', params: { id } }) }}
              />
            ) : posts.isError ? (
              <ErrorState error={posts.error} onRetry={() => posts.refetch()} />
            ) : (
              <EmptyState
                title="No posts yet"
                body={member ? 'Share an update, a question or a useful link with the community.' : 'Posts shared in this community will show up here.'}
                action={member ? { label: 'Write a post', onPress: () => router.push({ pathname: '/compose', params: { communityId: id } }) } : undefined}
              />
            )
          }
          ListHeaderComponent={posts.isError && items.length ? <ErrorState error={posts.error} onRetry={() => posts.refetch()} /> : undefined}
          ListFooterComponent={<ListFooter loading={posts.isFetchingNextPage} />}
          onEndReached={() => posts.hasNextPage && !posts.isFetching && posts.fetchNextPage()}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
