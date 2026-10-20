import { router } from 'expo-router';
import { BellOff, Bell, CheckCheck, Pin, PinOff, SquarePen } from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { InboxEntry } from '@/api/types';
import { PageHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ActionSheet } from '@/components/Overlays';
import { SearchField } from '@/components/Field';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { BrowseRow, InboxRow } from '@/features/communities/CommunityRow';
import { useBrowseCommunities, useInbox, useInboxActions, useJoinCommunity, useMarkCommunityRead } from '@/features/communities/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter, size, space } from '@/theme';

type Filter = 'all' | 'unread' | 'discover';

const ROW_INSET = gutter + size.communityLg + space[3];

export default function CommunitiesScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const inbox = useInbox();
  const unreadRows = inbox.data?.filter((e) => e.unreadCount > 0 && !e.isMuted).length ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <PageHeader title="Communities" actions={<IconButton icon={SquarePen} label="New post" onPress={() => router.push('/compose')} />} />
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={filter === 'discover' ? 'Search communities to join' : 'Search messages and communities'}
        />
      </View>
      <Tabs<Filter>
        items={[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread', count: unreadRows },
          { key: 'discover', label: 'Discover' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {filter === 'discover' ? (
        <CommunityDiscovery query={query} />
      ) : (
        <Inbox filter={filter} query={query} onDiscover={() => setFilter('discover')} />
      )}
    </SafeAreaView>
  );
}

function Inbox({ filter, query, onDiscover }: { filter: 'all' | 'unread'; query: string; onDiscover: () => void }) {
  const inbox = useInbox();
  const pull = usePullToRefresh(inbox.refetch);
  const { mute, pin } = useInboxActions();
  const markRead = useMarkCommunityRead();
  const [menuFor, setMenuFor] = useState<InboxEntry | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());

  const rows = useMemo(() => {
    let list = inbox.data ?? [];
    if (filter === 'unread') list = list.filter((e) => e.unreadCount > 0);
    if (q) list = list.filter((e) => e.community.name.toLowerCase().includes(q) || e.lastMessage?.text.toLowerCase().includes(q));
    return list;
  }, [inbox.data, filter, q]);

  if (inbox.isPending) return <SkeletonList shape="square" />;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.community.id}
        renderItem={({ item }) => (
          <InboxRow
            entry={item}
            onPress={() => router.push({ pathname: '/community/[id]', params: { id: item.community.id } })}
            onLongPress={() => setMenuFor(item)}
          />
        )}
        ItemSeparatorComponent={() => <Hairline inset={ROW_INSET} />}
        ListHeaderComponent={
          <>
            {inbox.isError && rows.length ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}
          </>
        }
        ListEmptyComponent={
          inbox.isError ? (
            <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} />
          ) : q ? (
            <Text variant="post" color="textSecondary" style={styles.noResults}>
              No communities or messages match “{query.trim()}”.
            </Text>
          ) : filter === 'unread' ? (
            <EmptyState title="You're all caught up" body="New messages in your communities will show up here." />
          ) : (
            <EmptyState
              title="No communities yet"
              body="Join a community to start chatting with people who share your interests."
              action={{ label: 'Discover communities', onPress: onDiscover }}
            />
          )
        }
        refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        keyboardShouldPersistTaps="handled"
      />
      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.community.name}
        onClose={() => setMenuFor(null)}
        actions={
          menuFor
            ? [
                {
                  label: menuFor.isPinned ? 'Unpin' : 'Pin to top',
                  icon: menuFor.isPinned ? PinOff : Pin,
                  onPress: () => pin.mutate({ id: menuFor.community.id, pinned: !menuFor.isPinned }),
                },
                {
                  label: menuFor.isMuted ? 'Unmute' : 'Mute',
                  icon: menuFor.isMuted ? Bell : BellOff,
                  onPress: () => mute.mutate({ id: menuFor.community.id, muted: !menuFor.isMuted }),
                },
                ...(menuFor.unreadCount
                  ? [
                      {
                        label: 'Mark as read',
                        icon: CheckCheck,
                        onPress: () => markRead.mutate({ id: menuFor.community.id, lastMessageId: null }),
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </>
  );
}

function CommunityDiscovery({ query }: { query: string }) {
  const q = useDeferredValue(query.trim());
  const browse = useBrowseCommunities(q);
  const pull = usePullToRefresh(browse.refetch);
  const join = useJoinCommunity();
  const toast = useToast();
  const items = flatten(browse.data);

  if (browse.isPending) return <SkeletonList shape="square" />;

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <BrowseRow
          community={item}
          membership={item.membership}
          joining={join.isPending && join.variables === item.id}
          onPress={() => router.push({ pathname: '/community/[id]/info', params: { id: item.id } })}
          onJoin={() =>
            join.mutate(item.id, {
              onSuccess: (c) =>
                toast.show(
                  c.membership === 'pending'
                    ? { message: `Request sent to ${c.name}` }
                    : {
                        message: `You joined ${c.name}`,
                        action: { label: 'Open', onPress: () => router.push({ pathname: '/community/[id]', params: { id: c.id } }) },
                      },
                ),
              onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}` }),
            })
          }
        />
      )}
      ItemSeparatorComponent={() => <Hairline inset={ROW_INSET} />}
      ListHeaderComponent={
        <>
          <Text variant="label" color="textTertiary" style={styles.sectionLabel}>
            {q ? 'Results' : 'Suggested for you'}
          </Text>
        </>
      }
      ListEmptyComponent={
        browse.isError ? (
          <ErrorState error={browse.error} onRetry={() => browse.refetch()} />
        ) : (
          <Text variant="post" color="textSecondary" style={styles.noResults}>
            No communities match “{q}”. Try a broader word, like “design” or “campus”.
          </Text>
        )
      }
      ListFooterComponent={<ListFooter loading={browse.isFetchingNextPage} />}
      onEndReached={() => browse.hasNextPage && !browse.isFetchingNextPage && browse.fetchNextPage()}
      refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  search: { paddingHorizontal: gutter, paddingBottom: space[3] },
  noResults: { padding: space[6] },
  sectionLabel: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[1] },
});
