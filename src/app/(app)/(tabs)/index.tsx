import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowDown, Bell, ImageIcon, RotateCw, Search } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { FeedItem, FeedScope } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { IconButton, NewDot } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useFeed } from '@/features/feed/hooks';
import { PostRow } from '@/features/feed/PostRow';
import { refreshFeed, useFeedRefreshing } from '@/features/feed/refresh';
import { UpdateBand } from '@/features/feed/UpdateBand';
import { StoryRow } from '@/features/stories/StoryRow';
import { useUnreadNotificationCount } from '@/features/notifications/hooks';
import { useMe } from '@/features/profile/hooks';
import { flattenUnique } from '@/lib/cache';
import { PULL_MAX, PULL_TRIGGER, useWebPullToRefresh } from '@/lib/useWebPullToRefresh';
import { api } from '@/services';
import { colors, gutter, shadow, size, space } from '@/theme';

// Following people is not offered by every backend; without it there is no Following feed.
const SCOPES: { key: FeedScope; label: string }[] = [
  { key: 'for-you', label: 'For you' },
  ...(api.capabilities.social ? [{ key: 'following' as const, label: 'Following' }] : []),
  { key: 'communities', label: 'Communities' },
];

const EMPTY: Record<FeedScope, { title: string; body: string; action: { label: string; href: '/discover' | '/communities' } }> = {
  'for-you': {
    title: 'Nothing here yet',
    body: 'Join a few communities and posts from them will show up here.',
    action: { label: 'Find communities', href: '/communities' },
  },
  following: {
    title: 'No posts from people you follow',
    body: "Follow people from their profiles and you'll see what they share here.",
    action: { label: 'Find communities', href: '/communities' },
  },
  communities: {
    title: 'No community posts yet',
    body: 'Posts and updates from communities you join will show up here.',
    action: { label: 'Find communities', href: '/communities' },
  },
};

export default function FeedScreen() {
  const [scope, setScope] = useState<FeedScope>('for-you');
  // Mount each tab once visited, then keep it mounted so its scroll position survives switching.
  const [visited, setVisited] = useState<Set<FeedScope>>(() => new Set(['for-you']));
  const unread = useUnreadNotificationCount();
  const toast = useToast();
  const refreshing = useFeedRefreshing(scope);
  const lists = useRef<Partial<Record<FeedScope, FlatList<FeedItem> | null>>>({});

  /** Latest posts from the API; back to the top once they arrive. A failure keeps what is shown. */
  const refresh = async (target: FeedScope) => {
    try {
      if (await refreshFeed(target)) lists.current[target]?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      toast.show({ message: `Couldn't refresh. ${describeError(e)} Your posts are still here.` });
    }
  };

  const select = (next: FeedScope) => {
    setScope(next);
    setVisited((v) => (v.has(next) ? v : new Set(v).add(next)));
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/brand/kinnoc-lockup-blue.png')}
          style={styles.lockup}
          contentFit="contain"
          accessibilityLabel="Kinnoc"
          accessibilityRole="header"
        />
        <View style={styles.headerActions}>
          {/* Desktop browsers have no pull gesture; a button refreshes there (and on touch web too). */}
          {Platform.OS === 'web' ? (
            refreshing ? (
              <View style={styles.headerSpinner} accessible accessibilityLabel="Refreshing feed" accessibilityRole="progressbar">
                <ActivityIndicator size="small" color={colors.textTertiary} />
              </View>
            ) : (
              <IconButton icon={RotateCw} label="Refresh feed" onPress={() => void refresh(scope)} />
            )
          ) : null}
          <IconButton icon={Search} label="Search Discover" onPress={() => router.push({ pathname: '/discover', params: { search: String(Date.now()) } })} />
          {api.capabilities.social ? (
            <IconButton
              icon={Bell}
              label={unread.data ? `Notifications, ${unread.data} new` : 'Notifications'}
              onPress={() => router.push('/notifications')}
              badge={unread.data ? <NewDot /> : null}
            />
          ) : null}
        </View>
      </View>
      <Tabs items={SCOPES} value={scope} onChange={select} />
      {SCOPES.filter((s) => visited.has(s.key)).map((s) => (
        <View key={s.key} style={[styles.flex, s.key !== scope && styles.hidden]}>
          <FeedList scope={s.key} onRefresh={() => void refresh(s.key)} listRef={(list) => (lists.current[s.key] = list)} />
        </View>
      ))}
    </SafeAreaView>
  );
}

function Composer() {
  const me = useMe();
  return (
    // Two sibling buttons, not one inside the other, so screen readers reach both.
    <View style={styles.composer}>
      <Pressable
        onPress={() => router.push('/compose')}
        style={styles.composerPrompt}
        accessibilityRole="button"
        accessibilityLabel="Share something with your communities"
        pressedOpacity={0.7}
      >
        <Avatar name={me.data?.displayName ?? ''} uri={me.data?.avatarUrl} size={36} />
        <Text variant="message" color="textTertiary" style={styles.flex} numberOfLines={1}>
          Share something with your communities
        </Text>
      </Pressable>
      <IconButton icon={ImageIcon} label="Add a photo" color="textTertiary" onPress={() => router.push({ pathname: '/compose', params: { photo: '1' } })} />
    </View>
  );
}

function FeedList({ scope, onRefresh, listRef }: { scope: FeedScope; onRefresh: () => void; listRef: (list: FlatList<FeedItem> | null) => void }) {
  const feed = useFeed(scope);
  const refreshing = useFeedRefreshing(scope);
  const webPull = useWebPullToRefresh(onRefresh, refreshing);
  const items = flattenUnique(feed.data, (item) => `${item.kind}:${item.id}`);

  const renderItem = ({ item }: { item: FeedItem }) =>
    item.kind === 'post' ? <PostRow post={item} /> : <UpdateBand update={item} />;

  const header = (
    <>
      {scope === 'for-you' && api.capabilities.social ? (
        <>
          <StoryRow />
          <Hairline />
        </>
      ) : null}
      {api.capabilities.feed ? (
        <>
          <Composer />
          <Hairline />
        </>
      ) : null}
    </>
  );

  if (feed.isPending) {
    return (
      <View>
        {header}
        <SkeletonList rows={4} media />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        ref={listRef}
        {...webPull?.handlers}
        data={items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        renderItem={renderItem}
        ItemSeparatorComponent={Hairline}
        ListHeaderComponent={
          <>
            {header}
            {feed.isError && items.length ? <ErrorState error={feed.error} onRetry={() => feed.refetch()} /> : null}
          </>
        }
        ListEmptyComponent={
          feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
          ) : (
            <EmptyState
              title={EMPTY[scope].title}
              body={EMPTY[scope].body}
              action={{ label: EMPTY[scope].action.label, onPress: () => router.push(EMPTY[scope].action.href) }}
              illustration={false}
              style={styles.empty}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={feed.isFetchingNextPage} />}
        // An empty feed fills the space down to the tab bar, so its message can sit in the middle.
        contentContainerStyle={items.length ? undefined : styles.fill}
        // One page at a time, and never during a refresh, whose new first page replaces the list.
        onEndReached={() => feed.hasNextPage && !feed.isFetching && !refreshing && feed.fetchNextPage()}
        onEndReachedThreshold={0.6}
        // iOS and Android: the native pull. The web has none, so it uses the gesture above instead.
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textTertiary} />}
      />
      {webPull ? <PullIndicator pull={webPull.pull} refreshing={refreshing} /> : null}
    </View>
  );
}

/**
 * The web's pull indicator: an arrow that follows the finger and turns once the pull is far
 * enough, then a small spinner while the feed refreshes (from a pull or the header button).
 */
function PullIndicator({ pull, refreshing }: { pull: Animated.Value; refreshing: boolean }) {
  const progress = pull.interpolate({ inputRange: [0, PULL_TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' });
  const translateY = pull.interpolate({ inputRange: [0, PULL_MAX], outputRange: [-44, PULL_MAX / 2], extrapolate: 'clamp' });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View pointerEvents="none" style={styles.pullWrap}>
      {refreshing ? (
        <View style={styles.pullBubble}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <Animated.View style={[styles.pullBubble, { opacity: progress, transform: [{ translateY }, { rotate }] }]}>
          <ArrowDown size={18} color={colors.primary} strokeWidth={2} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  headerSpinner: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pullWrap: { position: 'absolute', top: space[2], left: 0, right: 0, alignItems: 'center' },
  pullBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.float },
  fill: { flexGrow: 1 },
  // Centred in the space under the composer, nudged above the middle so it reads as balanced.
  empty: { flex: 1, justifyContent: 'center', paddingTop: space[6], paddingBottom: space[8] * 2 },
  header: { height: size.headerHeight, flexDirection: 'row', alignItems: 'center', paddingLeft: gutter, paddingRight: gutter - 10 },
  lockup: { height: 34, width: 70, marginRight: 'auto' },
  headerActions: { flexDirection: 'row' },
  composer: { flexDirection: 'row', alignItems: 'center', paddingLeft: gutter, paddingRight: gutter - 10, paddingVertical: space[2] },
  composerPrompt: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
});
