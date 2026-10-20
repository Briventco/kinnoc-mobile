import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/Header';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { DateStamp } from '@/features/discover/DiscoverRows';
import { useSaved } from '@/features/saved/hooks';
import { SavedRow, savedKey } from '@/features/saved/SavedRow';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, space } from '@/theme';

/** Bookmarked posts, events, opportunities and resources. Tapping a bookmark removes it. */
export default function SavedScreen() {
  const saved = useSaved();
  const pull = usePullToRefresh(saved.refetch);
  const items = flatten(saved.data).filter((s) => (s.kind === 'post' ? s.post.savedByMe : s.item.savedByMe));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Saved" />
      {saved.isPending ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={items}
          keyExtractor={savedKey}
          renderItem={({ item }) => <SavedRow item={item} />}
          ItemSeparatorComponent={Hairline}
          ListHeaderComponent={
            items.length ? (
              <>
                <Text variant="meta" color="textTertiary" style={styles.hint}>
                  Tap a bookmark to remove it from Saved.
                </Text>
              </>
            ) : undefined
          }
          ListEmptyComponent={
            saved.isError ? (
              <ErrorState error={saved.error} onRetry={() => saved.refetch()} />
            ) : (
              <EmptyState
                title="Nothing saved yet"
                body="Tap the bookmark on a post, event or opportunity and it lands here, ready when you are."
                lifted={<DateStamp iso={new Date().toISOString()} />}
                action={{ label: 'Browse Discover', onPress: () => router.navigate('/discover') }}
                secondary={{ label: 'Go to Feed', onPress: () => router.navigate('/') }}
              />
            )
          }
          ListFooterComponent={<ListFooter loading={saved.isFetchingNextPage} />}
          onEndReached={() => saved.hasNextPage && !saved.isFetchingNextPage && saved.fetchNextPage()}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hint: { paddingHorizontal: 16, paddingTop: space[3] },
});
