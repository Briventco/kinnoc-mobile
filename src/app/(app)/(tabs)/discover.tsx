import { router, useLocalSearchParams } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DiscoverFilter, DiscoverItem } from '@/api/types';
import { Button } from '@/components/Button';
import { SearchField } from '@/components/Field';
import { PageHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { DiscoverRow, FeaturedItem } from '@/features/discover/DiscoverRows';
import { useDiscoverHome, useDiscoverList } from '@/features/discover/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { api } from '@/services';
import { colors, gutter, space } from '@/theme';

const FILTERS: { key: DiscoverFilter; label: string; kind?: DiscoverItem['kind'] }[] = [
  { key: 'all', label: 'All' },
  { key: 'events', label: 'Events', kind: 'event' },
  { key: 'opportunities', label: 'Opportunities', kind: 'opportunity' },
  { key: 'resources', label: 'Resources', kind: 'resource' },
];
const KINDS = api.capabilities.discoverKinds;
/** Only what the backend can list gets a tab. */
const TABS = FILTERS.filter((f) => !f.kind || KINDS.includes(f.kind));
const ONLY_EVENTS = KINDS.length === 1 && KINDS[0] === 'event';
/** Search starts at two characters, as the API requires. */
const MIN_QUERY = 2;

const ROW_INSET = gutter + 44 + space[3];

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ search?: string }>();
  const [filter, setFilter] = useState<DiscoverFilter>('all');
  const [query, setQuery] = useState('');
  const typed = useDeferredValue(query.trim());
  const q = typed.length >= MIN_QUERY ? typed : '';

  const showHome = filter === 'all' && !q;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <PageHeader title="Discover" actions={<IconButton icon={Bookmark} label="Saved" onPress={() => router.push('/saved')} />} />
      <View style={styles.search}>
        {/* Opened from the Feed search button: each press passes a new token, which remounts and focuses the field. */}
        <SearchField key={params.search ?? 'search'} autoFocus={!!params.search} value={query} onChangeText={setQuery} placeholder={ONLY_EVENTS ? 'Search events, organisers, cities' : 'Events, internships, scholarships, guides'} />
      </View>
      <Tabs items={TABS} value={filter} onChange={setFilter} />
      {showHome ? <DiscoverHomeView onSeeAll={setFilter} /> : <DiscoverList filter={filter} query={q} />}
    </SafeAreaView>
  );
}

function Section({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="section" accessibilityRole="header">
          {title}
        </Text>
        {onSeeAll ? <Button variant="text" subdued label="See all" onPress={onSeeAll} /> : null}
      </View>
      {children}
    </View>
  );
}

function Rows({ items }: { items: DiscoverItem[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={item.id}>
          {i > 0 ? <Hairline inset={ROW_INSET} style={styles.rowRule} /> : null}
          <DiscoverRow item={item} />
        </View>
      ))}
    </View>
  );
}

function DiscoverHomeView({ onSeeAll }: { onSeeAll: (f: DiscoverFilter) => void }) {
  const home = useDiscoverHome();
  const pull = usePullToRefresh(home.refetch);
  if (home.isPending) return <SkeletonList shape="square" />;
  if (home.isError) return <ErrorState error={home.error} onRetry={() => home.refetch()} />;
  const { thisWeek, closingSoon, upcomingEvents, resources } = home.data;
  const empty = !thisWeek.length && !closingSoon.length && !upcomingEvents.length && !resources.length;

  return (
    <ScrollView
      contentContainerStyle={styles.homeContent}
      refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
      keyboardShouldPersistTaps="handled"
    >
      {empty ? (
        <Text variant="post" color="textSecondary" style={styles.empty}>
          {ONLY_EVENTS
            ? 'No upcoming events right now. New events appear here as soon as they’re published.'
            : 'Nothing to discover right now. New events and opportunities appear here as communities share them.'}
        </Text>
      ) : null}
      {thisWeek.length ? (
        <Section title={ONLY_EVENTS ? 'This week' : 'This week on Kinnoc'}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} decelerationRate="fast" snapToInterval={262 + space[3]}>
            {thisWeek.map((item) => (
              <FeaturedItem key={item.id} item={item} />
            ))}
          </ScrollView>
        </Section>
      ) : null}
      {closingSoon.length ? (
        <Section title="Closing soon" onSeeAll={() => onSeeAll('opportunities')}>
          <Rows items={closingSoon} />
        </Section>
      ) : null}
      {upcomingEvents.length ? (
        <Section title="Upcoming events" onSeeAll={() => onSeeAll('events')}>
          <Rows items={upcomingEvents} />
        </Section>
      ) : null}
      {resources.length ? (
        <Section title="Resources to learn from" onSeeAll={() => onSeeAll('resources')}>
          <Rows items={resources.slice(0, 3)} />
        </Section>
      ) : null}
    </ScrollView>
  );
}

function DiscoverList({ filter, query }: { filter: DiscoverFilter; query: string }) {
  const list = useDiscoverList(filter, query);
  const pull = usePullToRefresh(list.refetch);
  const items = flatten(list.data);
  if (list.isPending) return <SkeletonList shape="square" />;
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <DiscoverRow item={item} />}
      ItemSeparatorComponent={() => <Hairline inset={ROW_INSET} style={styles.rowRule} />}
      ListEmptyComponent={
        list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : (
          <Text variant="post" color="textSecondary" style={styles.empty}>
            {query
              ? `Nothing matches “${query}”. Try another word${TABS.length > 2 ? ' or a different filter' : ''}.`
              : filter === 'events'
                ? 'No upcoming events yet. Pull down to check again.'
                : 'Nothing here yet. Check back soon.'}
          </Text>
        )
      }
      ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
      refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  search: { paddingHorizontal: gutter, paddingBottom: space[3] },
  homeContent: { paddingBottom: space[8] },
  section: { paddingTop: space[5] },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: gutter, minHeight: 44 },
  strip: { paddingHorizontal: gutter, gap: space[3], paddingTop: space[1] },
  rowRule: { marginRight: gutter },
  empty: { padding: space[6] },
});
