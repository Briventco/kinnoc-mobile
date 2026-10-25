import { router } from 'expo-router';
import { BellOff, Bell, CheckCheck, Info, Pin, PinOff, Plus } from 'lucide-react-native';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { Community, InboxEntry } from '@/api/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { PageHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, type SheetAction } from '@/components/Overlays';
import { SearchField } from '@/components/Field';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { BrowseRow, InboxRow, PendingRow } from '@/features/communities/CommunityRow';
import {
  useBrowseCommunities,
  useCategories,
  useDeclineInvitation,
  useInbox,
  useInboxActions,
  useJoinCommunity,
  useMarkCommunityRead,
  useMyCommunities,
} from '@/features/communities/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { api } from '@/services';
import { colors, gutter, size, space } from '@/theme';

type Filter = 'all' | 'unread' | 'discover';

const ROW_INSET = gutter + size.communityLg + space[3];

const openInfo = (id: string) => router.push({ pathname: '/community/[id]/info', params: { id } });
const openChat = (id: string) => router.push({ pathname: '/community/[id]', params: { id } });

export default function CommunitiesScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const inbox = useInbox();
  const unreadRows = inbox.data?.filter((e) => e.unreadCount > 0 && !e.isMuted).length ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <PageHeader title="Communities" actions={<IconButton icon={Plus} label="Create a community" onPress={() => router.push('/community/new')} />} />
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={filter === 'discover' ? 'Search communities to join' : 'Search your communities'}
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

/** Invitations to answer and requests waiting for approval, above the conversations. */
function Pending() {
  const invited = useMyCommunities('invited');
  const requested = useMyCommunities('pending');
  const join = useJoinCommunity();
  const decline = useDeclineInvitation();
  const toast = useToast();
  const rows = [...(invited.data ?? []), ...(requested.data ?? [])];
  if (!rows.length) return null;

  const busy = (c: Community) => (join.isPending && join.variables === c.id) || (decline.isPending && decline.variables === c.id);

  return (
    <View>
      <Text variant="label" color="textTertiary" style={styles.sectionLabel}>
        {invited.data?.length ? 'Invitations and requests' : 'Waiting for approval'}
      </Text>
      {rows.map((c, i) => (
        <View key={c.id}>
          {i ? <Hairline inset={ROW_INSET} /> : null}
          <PendingRow community={c} onPress={() => openInfo(c.id)}>
            {c.membership === 'invited' ? (
              <View style={styles.pendingActions}>
                <Button
                  label="Decline"
                  variant="quiet"
                  size="small"
                  disabled={busy(c)}
                  onPress={() => decline.mutate(c.id, { onError: (e) => toast.show({ message: `Couldn't decline. ${describeError(e)}` }) })}
                />
                <Button
                  label="Accept"
                  variant="join"
                  size="small"
                  loading={join.isPending && join.variables === c.id}
                  disabled={busy(c)}
                  onPress={() =>
                    join.mutate(c.id, {
                      onSuccess: (next) =>
                        toast.show({ message: `You joined ${next.name}`, action: { label: 'Open', onPress: () => openChat(next.id) } }),
                      onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}` }),
                    })
                  }
                />
              </View>
            ) : null}
          </PendingRow>
        </View>
      ))}
      <Hairline style={styles.pendingEnd} />
    </View>
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

  const menuActions = (entry: InboxEntry): SheetAction[] => [
    ...(api.capabilities.inboxPreferences
      ? [
          {
            label: entry.isPinned ? 'Unpin' : 'Pin to top',
            icon: entry.isPinned ? PinOff : Pin,
            onPress: () => pin.mutate({ id: entry.community.id, pinned: !entry.isPinned }),
          },
          {
            label: entry.isMuted ? 'Unmute' : 'Mute',
            icon: entry.isMuted ? Bell : BellOff,
            onPress: () => mute.mutate({ id: entry.community.id, muted: !entry.isMuted }),
          },
        ]
      : []),
    ...(entry.unreadCount
      ? [{ label: 'Mark as read', icon: CheckCheck, onPress: () => markRead.mutate({ id: entry.community.id, lastMessageId: null }) }]
      : []),
    { label: 'Community info', icon: Info, onPress: () => openInfo(entry.community.id) },
  ];

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(e) => e.community.id}
        renderItem={({ item }) => <InboxRow entry={item} onPress={() => openChat(item.community.id)} onLongPress={() => setMenuFor(item)} />}
        ItemSeparatorComponent={() => <Hairline inset={ROW_INSET} />}
        ListHeaderComponent={
          <>
            {filter === 'all' && !q ? <Pending /> : null}
            {inbox.isError && rows.length ? <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} /> : null}
          </>
        }
        ListEmptyComponent={
          inbox.isError ? (
            <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} />
          ) : q ? (
            <Text variant="post" color="textSecondary" style={styles.noResults}>
              None of your communities match “{query.trim()}”.
            </Text>
          ) : filter === 'unread' ? (
            <EmptyState title="You're all caught up" body="New messages in your communities will show up here." />
          ) : (
            <EmptyState
              title="No communities yet"
              body="Join a community to start chatting with people who share your interests, or start your own."
              action={{ label: 'Discover communities', onPress: onDiscover }}
            />
          )
        }
        refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        keyboardShouldPersistTaps="handled"
      />
      <ActionSheet visible={!!menuFor} title={menuFor?.community.name} onClose={() => setMenuFor(null)} actions={menuFor ? menuActions(menuFor) : []} />
    </>
  );
}

function CategoryFilter({ value, onChange }: { value: string | null; onChange: (slug: string | null) => void }) {
  const categories = useCategories();
  if (!categories.data?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Categories">
      <Chip label="All" selected={value === null} onPress={() => onChange(null)} />
      {categories.data.map((c) => (
        <Chip key={c.slug} label={c.name} selected={value === c.slug} onPress={() => onChange(value === c.slug ? null : c.slug)} />
      ))}
    </ScrollView>
  );
}

function CommunityDiscovery({ query }: { query: string }) {
  const q = useDeferredValue(query.trim());
  const [category, setCategory] = useState<string | null>(null);
  // The API searches from two characters; one character shows the unfiltered list.
  const filter = { query: q.length >= 2 ? q : '', category };
  const browse = useBrowseCommunities(filter);
  const pull = usePullToRefresh(browse.refetch);
  const join = useJoinCommunity();
  const toast = useToast();
  const items = flatten(browse.data);
  const filtered = !!filter.query || !!category;

  return (
    <FlatList
      data={browse.isPending ? [] : items}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <BrowseRow
          community={item}
          joining={join.isPending && join.variables === item.id}
          onPress={() => openInfo(item.id)}
          onJoin={() =>
            join.mutate(item.id, {
              onSuccess: (c) =>
                toast.show(
                  c.membership === 'pending'
                    ? { message: `Request sent to ${c.name}` }
                    : { message: `You joined ${c.name}`, action: { label: 'Open', onPress: () => openChat(c.id) } },
                ),
              onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}` }),
            })
          }
        />
      )}
      ItemSeparatorComponent={() => <Hairline inset={ROW_INSET} />}
      ListHeaderComponent={
        <>
          <CategoryFilter value={category} onChange={setCategory} />
          <Text variant="label" color="textTertiary" style={styles.sectionLabel}>
            {filtered ? 'Results' : 'Newest communities'}
          </Text>
        </>
      }
      ListEmptyComponent={
        browse.isPending ? (
          <SkeletonList shape="square" />
        ) : browse.isError ? (
          <ErrorState error={browse.error} onRetry={() => browse.refetch()} />
        ) : filtered ? (
          <Text variant="post" color="textSecondary" style={styles.noResults}>
            No public communities match. Try another word or category, or start one yourself.
          </Text>
        ) : (
          <EmptyState
            title="No public communities yet"
            body="Be the first: start a community around something you care about."
            action={{ label: 'Create a community', onPress: () => router.push('/community/new') }}
          />
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
  chips: { gap: space[2], paddingHorizontal: gutter, paddingTop: space[3] },
  pendingActions: { flexDirection: 'row', gap: space[2] },
  pendingEnd: { marginTop: space[1] },
});
