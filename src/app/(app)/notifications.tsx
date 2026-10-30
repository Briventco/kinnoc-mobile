import { router, type Href } from 'expo-router';
import { AtSign, Bell, CalendarClock, Clock, Heart, MessageCircle, SlidersHorizontal, SmilePlus, Users, type LucideIcon } from 'lucide-react-native';
import { SectionList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppNotification, NotificationKind } from '@/api/types';
import { Avatar, CommunityAvatar, OrgMonogram } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { Pressable } from '@/components/Pressable';
import { DateStamp } from '@/features/discover/DiscoverRows';
import { EmptyState, ErrorState, ListFooter, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/features/notifications/hooks';
import { flatten } from '@/lib/cache';
import { formatAgeLong } from '@/lib/format';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { api } from '@/services';
import { colors, communityRadius, gutter, space } from '@/theme';

const BADGE: Record<NotificationKind, { icon: LucideIcon; bg: string } | null> = {
  mention: { icon: AtSign, bg: colors.brandNavy },
  reply: { icon: MessageCircle, bg: colors.brandNavy },
  like: { icon: Heart, bg: colors.primary },
  reaction: { icon: SmilePlus, bg: colors.primary },
  deadline: { icon: Clock, bg: colors.warning },
  'event-reminder': { icon: CalendarClock, bg: colors.brandNavy },
  community: { icon: Users, bg: colors.brandNavy },
};

function Identity({ n }: { n: AppNotification }) {
  const badge = BADGE[n.kind];
  let base: React.ReactNode;
  let square = false;
  if (n.actor) base = <Avatar name={n.actor.displayName} uri={n.actor.avatarUrl} size={44} />;
  else if (n.event) {
    square = true;
    base = (
      <View style={styles.stampBox}>
        <DateStamp iso={n.event.startsAt} />
      </View>
    );
  } else if (n.opportunity) {
    square = true;
    base = <OrgMonogram id={n.id} monogram={n.opportunity.organisationMonogram} size={44} />;
  } else if (n.community) {
    square = true;
    base = <CommunityAvatar id={n.community.id} monogram={n.community.monogram} uri={n.community.photoUrl} size={44} />;
  }
  // Event and community items are self-explanatory; only people and deadlines get a glyph.
  const showBadge = badge && (n.actor || n.kind === 'deadline');
  return (
    <View>
      {base}
      {showBadge ? (
        <View style={[styles.badge, { backgroundColor: badge.bg }, square && { right: -6, bottom: -6 }]}>
          <badge.icon size={11} color={colors.onPrimary} fill={n.kind === 'like' ? colors.onPrimary : 'none'} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

function NotificationRow({ n, onPress }: { n: AppNotification; onPress: () => void }) {
  const title = n.title.map((s) => s.text).join('');
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? '' : 'New. '}${title}. ${n.excerpt ?? ''} ${formatAgeLong(n.createdAt)}`}
      pressedOpacity={0.7}
    >
      <Identity n={n} />
      <View style={styles.body}>
        <Text variant="message" color="text">
          {n.title.map((s, i) => (
            <Text key={i} variant={s.strong ? 'name' : 'message'}>
              {s.text}
            </Text>
          ))}
        </Text>
        {n.excerpt ? (
          <Text variant="preview" color="textSecondary" numberOfLines={1}>
            {n.excerpt}
          </Text>
        ) : null}
        <Text variant="meta" color="textTertiary">
          {formatAgeLong(n.createdAt)}
        </Text>
      </View>
      {!n.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const list = useNotifications();
  const pull = usePullToRefresh(list.refetch);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (!api.capabilities.social) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Notifications" border={false} />
        <EmptyState
          title="Notifications aren't available yet"
          body="Mentions, replies and reminders will show up here once notifications are enabled on the Kinnoc backend."
          lifted={<Bell size={28} color={colors.textTertiary} strokeWidth={1.75} />}
          action={{ label: 'Back to Feed', onPress: () => router.navigate('/') }}
        />
      </SafeAreaView>
    );
  }

  const items = flatten(list.data);
  const fresh = items.filter((n) => !n.read);
  const earlier = items.filter((n) => n.read);
  const sections = [
    ...(fresh.length ? [{ title: 'New', data: fresh }] : []),
    ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
  ];

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.target) router.push(n.target as Href);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Notifications"
        border={false}
        right={
          <Button
            variant="text"
            subdued
            label="Mark all read"
            disabled={!fresh.length}
            onPress={() => markAll.mutate()}
            style={styles.markAll}
          />
        }
      />
      {list.isPending ? (
        <SkeletonList />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotificationRow n={item} onPress={() => open(item)} />}
          renderSectionHeader={({ section }) => (
            <Text variant="label" color="textTertiary" style={styles.sectionHeader} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            list.isError ? (
              <ErrorState error={list.error} onRetry={() => list.refetch()} />
            ) : (
              <EmptyState title="No notifications yet" body="Mentions, replies and reminders about things you saved will show up here." />
            )
          }
          ListFooterComponent={
            <>
              <ListFooter loading={list.isFetchingNextPage} />
              <Pressable onPress={() => router.push('/settings/notifications')} style={styles.settings} accessibilityRole="button">
                <SlidersHorizontal size={20} color={colors.textSecondary} strokeWidth={1.75} />
                <Text variant="name" color="textSecondary">
                  Notification settings
                </Text>
              </Pressable>
            </>
          }
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  markAll: { paddingHorizontal: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingHorizontal: gutter, paddingVertical: space[3] },
  body: { flex: 1, minWidth: 0, gap: 2 },
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  stampBox: { width: 44, height: 44, borderRadius: communityRadius(44), backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brandBlue, marginTop: 8 },
  sectionHeader: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[1] },
  sectionGap: { height: space[1] },
  settings: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, minHeight: 56, marginTop: space[3], borderTopWidth: 1, borderTopColor: colors.border },
});
