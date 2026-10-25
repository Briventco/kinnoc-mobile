import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Bell, ImageIcon, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FeedItem, FeedScope } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { IconButton, NewDot } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { useFeed } from '@/features/feed/hooks';
import { PostRow } from '@/features/feed/PostRow';
import { UpdateBand } from '@/features/feed/UpdateBand';
import { StoryRow } from '@/features/stories/StoryRow';
import { useUnreadNotificationCount } from '@/features/notifications/hooks';
import { useMe } from '@/features/profile/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { api } from '@/services';
import { colors, gutter, size, space } from '@/theme';

const SCOPES: { key: FeedScope; label: string }[] = [
  { key: 'for-you', label: 'For you' },
  { key: 'following', label: 'Following' },
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
          <IconButton icon={Search} label="Search Discover" onPress={() => router.push({ pathname: '/discover', params: { search: String(Date.now()) } })} />
          <IconButton
            icon={Bell}
            label={unread.data ? `Notifications, ${unread.data} new` : 'Notifications'}
            onPress={() => router.push('/notifications')}
            badge={unread.data ? <NewDot /> : null}
          />
        </View>
      </View>
      <Tabs items={SCOPES} value={scope} onChange={select} />
      {SCOPES.filter((s) => visited.has(s.key)).map((s) => (
        <View key={s.key} style={[styles.flex, s.key !== scope && styles.hidden]}>
          <FeedList scope={s.key} />
        </View>
      ))}
    </SafeAreaView>
  );
}

function Composer() {
  const me = useMe();
  return (
    <Pressable
      onPress={() => router.push('/compose')}
      style={styles.composer}
      accessibilityRole="button"
      accessibilityLabel="Share something with your communities"
      pressedOpacity={0.7}
    >
      <Avatar name={me.data?.displayName ?? ''} uri={me.data?.avatarUrl} size={36} />
      <Text variant="message" color="textTertiary" style={styles.flex} numberOfLines={1}>
        Share something with your communities
      </Text>
      <IconButton icon={ImageIcon} label="Add a photo" color="textTertiary" onPress={() => router.push({ pathname: '/compose', params: { photo: '1' } })} />
    </Pressable>
  );
}

function FeedList({ scope }: { scope: FeedScope }) {
  const feed = useFeed(scope);
  const pull = usePullToRefresh(feed.refetch);
  const items = flatten(feed.data);

  const renderItem = ({ item }: { item: FeedItem }) =>
    item.kind === 'post' ? <PostRow post={item} /> : <UpdateBand update={item} />;

  const header = (
    <>
      {scope === 'for-you' ? (
        <>
          <StoryRow />
          <Hairline />
        </>
      ) : null}
      {api.capabilities.social ? (
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
    <FlatList
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
          />
        )
      }
      ListFooterComponent={<ListFooter loading={feed.isFetchingNextPage} />}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl {...pull} tintColor={colors.textTertiary} />
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  hidden: { display: 'none' },
  header: { height: size.headerHeight, flexDirection: 'row', alignItems: 'center', paddingLeft: gutter, paddingRight: gutter - 10 },
  lockup: { height: 34, width: 70, marginRight: 'auto' },
  headerActions: { flexDirection: 'row' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: gutter, paddingRight: gutter - 10, paddingVertical: space[2] },
});
