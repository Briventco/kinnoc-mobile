import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { CommunityAvatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/Header';
import { MetaHead } from '@/components/MetaHead';
import { CenteredSpinner, EmptyState } from '@/components/States';
import { Text } from '@/components/Text';
import { useCommunity } from '@/features/communities/hooks';
import { accessCopy, MembershipActions } from '@/features/communities/MembershipActions';
import { colors, gutter, radius, space } from '@/theme';

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const community = useCommunity(code ?? '', !!code);

  if (!code) {
    return <Redirect href="/communities" />;
  }

  if (community.isPending) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Invitation" />
        <CenteredSpinner />
      </SafeAreaView>
    );
  }

  if (community.isError) {
    const notFound =
      community.error instanceof ApiError &&
      (community.error.code === 'not_found' || community.error.serverCode === 'COMMUNITY_NOT_FOUND');
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Invitation" />
        <EmptyState
          title={notFound ? 'Invitation invalid or expired' : "Couldn't load invitation"}
          body={
            notFound
              ? 'This community invitation link may be invalid, or the community no longer exists.'
              : 'Please check your connection and try again.'
          }
          action={{
            label: 'Explore Communities',
            onPress: () => router.navigate('/communities'),
          }}
        />
      </SafeAreaView>
    );
  }

  const c = community.data;

  // If already an active member, jump straight to the conversation
  if (c.membership === 'member') {
    return <Redirect href={`/community/${c.id}`} />;
  }

  const copy = accessCopy(c);

  return (
    <SafeAreaView style={styles.root}>
      <MetaHead
        title={`Invitation to ${c.name}`}
        description={c.description}
        image={c.photoUrl}
        url={`https://web.kinnoc.app/invite/${code}`}
      />
      <ScreenHeader title="Invitation" />
      <View style={styles.content}>
        <View style={styles.card}>
          <CommunityAvatar id={c.id} monogram={c.monogram} uri={c.photoUrl} size={72} />
          <Text variant="screenTitle" style={styles.title} numberOfLines={2}>
            {c.name}
          </Text>
          <View style={styles.badge}>
            <Mail size={14} color={colors.primary} />
            <Text variant="meta" color="primary">
              Community Invite
            </Text>
          </View>
          <Text variant="post" color="textSecondary" style={styles.body}>
            {copy.body}
          </Text>
          <View style={styles.actions}>
            <MembershipActions
              community={c}
              onJoined={(joined) => {
                router.replace(`/community/${joined.id}`);
              }}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: {
    flex: 1,
    paddingHorizontal: gutter,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface2,
    borderRadius: radius.feature,
    padding: space[5],
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
  },
  title: {
    marginTop: space[3],
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radius.full,
    marginTop: space[2],
    marginBottom: space[3],
  },
  body: {
    textAlign: 'center',
    marginBottom: space[4],
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
});
