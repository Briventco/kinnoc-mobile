import { router } from 'expo-router';
import { MessageSquareHeart, Plus } from 'lucide-react-native';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { FeedbackRow } from '@/features/feedback/FeedbackParts';
import { useMyFeedback } from '@/features/feedback/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter } from '@/theme';

/** Everything the viewer has sent, newest first, with its current status. */
export default function FeedbackHistory() {
  const list = useMyFeedback();
  const pull = usePullToRefresh(list.refetch);
  const items = flatten(list.data);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Your feedback"
        right={<IconButton icon={Plus} label="Send new feedback" onPress={() => router.push('/feedback/new')} />}
      />
      {list.isPending ? (
        <SkeletonList shape="square" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => <FeedbackRow item={item} onPress={() => router.push(`/feedback/${item.id}`)} />}
          ItemSeparatorComponent={() => <Hairline inset={gutter} />}
          ListEmptyComponent={
            list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <EmptyState
                title="No feedback yet"
                body="When you send feedback or a suggestion, you can follow its progress and read the Kinnoc team's replies here."
                lifted={<MessageSquareHeart size={28} color={colors.primary} strokeWidth={1.75} />}
                action={{ label: 'Send feedback', onPress: () => router.push('/feedback/new') }}
              />
            )
          }
          ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
