import { router } from 'expo-router';
import { Link2, MapPin, Share, SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, Share as RNShare, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Post, SavedItem } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { PostRow } from '@/features/feed/PostRow';
import { useMe, useUserCommunities, useUserPosts } from '@/features/profile/hooks';
import { CommunityStrip, InterestTags } from '@/features/profile/ProfileSections';
import { useSaved } from '@/features/saved/hooks';
import { SavedRow, savedKey } from '@/features/saved/SavedRow';
import { useMyVerification } from '@/features/verification/hooks';
import { verificationDetail, VerifiedName } from '@/features/verification/VerifiedBadge';
import { flatten } from '@/lib/cache';
import { formatCount } from '@/lib/format';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { openExternal } from '@/lib/links';
import { api } from '@/services';
import { colors, gutter, space, type } from '@/theme';

type ProfileTab = 'posts' | 'saved';
type Row = { kind: 'post'; post: Post } | { kind: 'saved'; item: SavedItem };

export default function ProfileScreen() {
  const me = useMe();
  const [tab, setTab] = useState<ProfileTab>('posts');
  const posts = useUserPosts(me.data?.id);
  const saved = useSaved();
  const communities = useUserCommunities(me.data?.username);
  const pull = usePullToRefresh(() =>
    Promise.all([me.refetch(), posts.refetch(), ...(api.capabilities.social ? [saved.refetch()] : []), communities.refetch()]),
  );

  const active = tab === 'posts' ? posts : saved;
  const rows: Row[] =
    tab === 'posts' ? flatten(posts.data).map((post) => ({ kind: 'post', post })) : flatten(saved.data).map((item) => ({ kind: 'saved', item }));

  if (me.isPending) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <SkeletonList rows={3} />
      </SafeAreaView>
    );
  }
  if (me.isError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </SafeAreaView>
    );
  }

  const p = me.data;
  const website = p.website ? (p.website.startsWith('http') ? p.website : `https://${p.website}`) : null;

  const header = (
    <View>
      <View style={styles.identity}>
        <Avatar name={p.displayName} uri={p.avatarUrl} size={76} />
        <View style={styles.flex}>
          <VerifiedName name={p.displayName} username={p.username} variant="pageTitle" style={styles.name} numberOfLines={2} explainable />
          <OwnVerificationNote username={p.username} />
          {p.headline ? (
            <Text variant="preview" color="textSecondary">
              {p.headline}
            </Text>
          ) : null}
          {p.location ? (
            <View style={styles.inline}>
              <MapPin size={14} color={colors.textTertiary} strokeWidth={1.75} />
              <Text variant="meta" color="textTertiary">
                {p.location}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.block}>
        {p.bio ? (
          <Text variant="post">{p.bio}</Text>
        ) : (
          <Text variant="post" color="textTertiary">
            Add a short bio so people know what you&apos;re into.
          </Text>
        )}
        <View style={styles.statsRow}>
          {website ? (
            <Pressable onPress={() => void openExternal(website)} style={styles.inline} accessibilityRole="link" hitSlop={8}>
              <Link2 size={16} color={colors.primary} strokeWidth={2} />
              <Text variant="name" color="primary">
                {p.website}
              </Text>
            </Pressable>
          ) : null}
          {api.capabilities.social ? (
            <>
              <Text variant="preview" color="textSecondary">
                <Text variant="name">{formatCount(p.followerCount)}</Text> followers
              </Text>
              <Text variant="preview" color="textSecondary">
                <Text variant="name">{formatCount(p.followingCount)}</Text> following
              </Text>
            </>
          ) : null}
        </View>
        <Button label="Edit profile" variant="quiet" fullWidth onPress={() => router.push('/settings/edit-profile')} />
      </View>

      <View style={styles.block}>
        <Text variant="label" color="textTertiary">
          Interests
        </Text>
        {p.interests.length ? (
          <InterestTags interests={p.interests} />
        ) : api.capabilities.profileDetails || api.capabilities.interestCatalogue ? (
          <Button variant="text" label="Add interests" onPress={() => router.push('/settings/edit-profile')} style={styles.alignStart} />
        ) : (
          <Text variant="preview" color="textTertiary">
            No interests added yet.
          </Text>
        )}
      </View>

      <View style={styles.block}>
        <View style={styles.sectionHead}>
          <Text variant="label" color="textTertiary">
            Communities · {communities.data?.length ?? p.communityCount}
          </Text>
          <Button variant="text" subdued label="See all" onPress={() => router.navigate('/communities')} />
        </View>
        {communities.data?.length ? (
          <CommunityStrip communities={communities.data} />
        ) : communities.isPending ? null : (
          <Text variant="preview" color="textTertiary">
            You haven&apos;t joined any communities yet.
          </Text>
        )}
      </View>

      {api.capabilities.social ? (
        <Tabs<ProfileTab>
          items={[
            { key: 'posts', label: 'Posts' },
            { key: 'saved', label: 'Saved' },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.topBar}>
        <Text variant="name" style={styles.handle} numberOfLines={1}>
          @{p.username}
        </Text>
        <IconButton icon={Share} label="Share profile" onPress={() => void RNShare.share({ message: `${p.displayName} (@${p.username}) on Kinnoc` })} />
        <IconButton icon={SlidersHorizontal} label="Settings" onPress={() => router.push('/settings')} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.kind === 'post' ? r.post.id : savedKey(r.item))}
        renderItem={({ item }) => (item.kind === 'post' ? <PostRow post={item.post} /> : <SavedRow item={item.item} />)}
        ItemSeparatorComponent={Hairline}
        ListHeaderComponent={header}
        ListEmptyComponent={
          active.isPending ? (
            <SkeletonList rows={2} />
          ) : active.isError ? (
            <ErrorState error={active.error} onRetry={() => active.refetch()} />
          ) : tab === 'posts' ? (
            <EmptyState
              title="No posts yet"
              body="Share what you're learning or building. Your posts show up here."
              action={{ label: 'Write a post', onPress: () => router.push('/compose') }}
            />
          ) : (
            <EmptyState
              title="Nothing saved yet"
              body="Tap the bookmark on a post, event or opportunity and it lands here, ready when you are."
              action={{ label: 'Browse Discover', onPress: () => router.navigate('/discover') }}
            />
          )
        }
        ListFooterComponent={<ListFooter loading={active.isFetchingNextPage} />}
        onEndReached={() => active.hasNextPage && !active.isFetchingNextPage && active.fetchNextPage()}
        refreshControl={
          <RefreshControl {...pull} tintColor={colors.textTertiary} />
        }
      />
    </SafeAreaView>
  );
}

/**
 * Under your name: why you are verified, or, privately, that your verification has lapsed. Read
 * from your own verification record; nothing shows while it loads or if it fails.
 */
function OwnVerificationNote({ username }: { username: string }) {
  const { data } = useMyVerification(username);
  if (!data) return null;
  if (data.isVerified) {
    const detail = verificationDetail(data);
    return (
      <View style={styles.verifiedLine}>
        <Text variant="meta" color="primary">
          Verified
        </Text>
        {detail ? (
          <Text variant="meta" color="textTertiary" numberOfLines={1} style={styles.flex}>
            · {detail}
          </Text>
        ) : null}
      </View>
    );
  }
  if (data.status === 'expired' || data.status === 'revoked') {
    return (
      <Text variant="meta" color="textTertiary">
        {data.status === 'expired' ? 'Your verification has expired.' : 'Your verification was removed.'} Only you can see this.
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: gutter, paddingRight: gutter - 10 },
  handle: { flex: 1, fontFamily: 'Figtree_700Bold', fontSize: 17 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: gutter, paddingTop: space[3] },
  name: { ...type.pageTitle, fontSize: 26, lineHeight: 30, color: colors.text },
  verifiedLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  block: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  statsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space[5], rowGap: space[1] },
  alignStart: { alignSelf: 'flex-start' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: -10 },
});
