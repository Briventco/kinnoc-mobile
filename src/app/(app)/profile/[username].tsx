import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Share } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Platform, RefreshControl, Share as RNShare, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { PullIndicator } from '@/components/PullIndicator';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { PostRow } from '@/features/feed/PostRow';
import { useMe, useProfile, useUserCommunities, useUserPosts } from '@/features/profile/hooks';
import { CommunityStrip, InterestTags } from '@/features/profile/ProfileSections';
import { useVerification } from '@/features/verification/hooks';
import { verificationDetail } from '@/features/verification/labels';
import { VerificationSheet } from '@/features/verification/VerificationSheet';
import { VerifiedName } from '@/features/verification/VerifiedBadge';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useWebPullToRefresh } from '@/lib/useWebPullToRefresh';
import { colors, gutter, space, type } from '@/theme';

/** Where shared profile links point outside the web app itself. */
const WEB_APP_URL = 'https://web.kinnoc.app';

/**
 * Someone's public profile at `/profile/<username>`: what the API lets the viewer see (name,
 * photo, bio, interests, public communities, verification) and their posts. Your own username
 * goes to your Profile tab, where you can edit it.
 */
export default function PublicProfileScreen() {
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const me = useMe();
  const profile = useProfile(username);
  const posts = useUserPosts(username);
  const communities = useUserCommunities(username);
  const pull = usePullToRefresh(() => Promise.all([profile.refetch(), posts.refetch(), communities.refetch()]));
  const webPull = useWebPullToRefresh(pull.onRefresh, pull.refreshing);

  if (me.data && username.toLowerCase() === me.data.username.toLowerCase()) return <Redirect href="/profile" />;

  const share = () => {
    const link = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/profile/${username}` : `${WEB_APP_URL}/profile/${username}`;
    const name = profile.data?.displayName;
    void RNShare.share({ message: name ? `${name} (@${username}) on Kinnoc: ${link}` : link });
  };

  const topBar = (
    <View style={styles.topBar}>
      <IconButton icon={ChevronLeft} label="Back" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Text variant="name" style={styles.handle} numberOfLines={1} accessibilityRole="header">
        @{username}
      </Text>
      <IconButton icon={Share} label="Share profile" onPress={share} />
    </View>
  );

  if (profile.isPending) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        {topBar}
        <SkeletonList rows={3} />
      </SafeAreaView>
    );
  }
  if (profile.isError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        {topBar}
        <ErrorState error={profile.error} onRetry={notFound(profile.error) ? undefined : () => profile.refetch()} />
      </SafeAreaView>
    );
  }

  const p = profile.data;
  const header = (
    <View>
      <View style={styles.identity}>
        <Avatar name={p.displayName} uri={p.avatarUrl} size={76} />
        <View style={styles.flex}>
          <VerifiedName name={p.displayName} username={p.username} variant="pageTitle" style={styles.name} numberOfLines={2} explainable />
          <VerifiedLine username={p.username} name={p.displayName} />
        </View>
      </View>

      {p.bio ? (
        <View style={styles.block}>
          <Text variant="post">{p.bio}</Text>
        </View>
      ) : null}

      {p.interests.length ? (
        <View style={styles.block}>
          <Text variant="label" color="textTertiary">
            Interests
          </Text>
          <InterestTags interests={p.interests} />
        </View>
      ) : null}

      {/* Only their PUBLIC communities; the section stays hidden if the API cannot list them. */}
      {communities.data?.length ? (
        <View style={styles.block}>
          <Text variant="label" color="textTertiary">
            Communities · {communities.data.length}
          </Text>
          <CommunityStrip communities={communities.data} />
        </View>
      ) : null}

      <View style={[styles.block, styles.postsHead]}>
        <Text variant="label" color="textTertiary">
          Posts
        </Text>
      </View>
      <Hairline />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {topBar}
      <View style={styles.flex}>
        <FlatList
          {...webPull?.handlers}
          data={flatten(posts.data)}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostRow post={item} />}
          ItemSeparatorComponent={Hairline}
          ListHeaderComponent={header}
          ListEmptyComponent={
            posts.isPending ? (
              <SkeletonList rows={2} />
            ) : posts.isError ? (
              <ErrorState error={posts.error} onRetry={() => posts.refetch()} />
            ) : (
              <EmptyState title="No posts yet" body={`When ${p.displayName.split(' ')[0]} shares something you can see, it shows up here.`} illustration={false} />
            )
          }
          ListFooterComponent={<ListFooter loading={posts.isFetchingNextPage} />}
          onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
        {webPull ? <PullIndicator pull={webPull.pull} refreshing={pull.refreshing} /> : null}
      </View>
    </SafeAreaView>
  );
}

const notFound = (error: unknown) => error instanceof ApiError && error.code === 'not_found';

/** "Verified · CEO, Brivent Global Innovations", tappable for the full explanation. */
function VerifiedLine({ username, name }: { username: string; name: string }) {
  const { data } = useVerification(username);
  const [open, setOpen] = useState(false);
  if (!data?.isVerified) return null;
  const detail = verificationDetail(data);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.verifiedLine} accessibilityRole="button" accessibilityLabel={`Verified${detail ? `, ${detail}` : ''}. Why ${name} is verified`} hitSlop={6}>
        <Text variant="meta" color="primary">
          Verified
        </Text>
        {detail ? (
          <Text variant="meta" color="textTertiary" numberOfLines={1} style={styles.shrink}>
            · {detail}
          </Text>
        ) : null}
      </Pressable>
      <VerificationSheet verification={open ? data : null} name={name} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  topBar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: gutter - 10, gap: 4 },
  handle: { flex: 1, fontFamily: 'Figtree_700Bold', fontSize: 17 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: gutter, paddingTop: space[3] },
  name: { ...type.pageTitle, fontSize: 26, lineHeight: 30, color: colors.text },
  verifiedLine: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  shrink: { flexShrink: 1 },
  block: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  postsHead: { paddingBottom: space[3] },
});
