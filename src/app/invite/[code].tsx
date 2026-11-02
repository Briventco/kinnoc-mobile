import * as Linking from 'expo-linking';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { MetaHead } from '@/components/MetaHead';
import { Banner, CenteredSpinner, EmptyState } from '@/components/States';
import { Text } from '@/components/Text';
import { useAcceptInvitation, useCommunity, useInvitation } from '@/features/communities/hooks';
import { formatDay } from '@/lib/format';
import { setPendingDestination } from '@/lib/pendingNavigation';
import { buildDeepLinkUrl } from '@/lib/shareLinks';
import { colors, gutter, radius, space } from '@/theme';

/**
 * A shared invitation link: `https://web.kinnoc.app/invite/<code>`. Outside the signed-in area on
 * purpose, so the link shows what it invites to before anyone signs in, in the app (opened through
 * Universal Links / App Links) and on the web fallback alike. Accepting needs an account; signing
 * in first keeps this page as the destination.
 */
export default function InviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === 'string' ? raw.trim() : '';
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const invitation = useInvitation(code, !!code);
  const communityId = invitation.data?.community.id ?? '';
  // Someone already in the community (from another invitation, or by joining) goes straight there.
  const existing = useCommunity(communityId, signedIn && !!communityId);
  const accept = useAcceptInvitation(code);

  if (!code) return <Redirect href="/" />;

  if (invitation.isPending) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Invitation" />
        <CenteredSpinner />
      </SafeAreaView>
    );
  }

  if (invitation.isError) {
    const error = invitation.error;
    const serverCode = error instanceof ApiError ? error.serverCode : null;
    if (serverCode === 'ALREADY_MEMBER') {
      const joinedId = (error as ApiError).details as { communityId?: string } | undefined;
      if (signedIn && joinedId?.communityId) return <Redirect href={`/community/${joinedId.communityId}`} />;
    }
    const state =
      serverCode === 'ALREADY_MEMBER'
        ? {
            title: 'Invitation already accepted',
            body: signedIn
              ? 'This invitation has been used. Find the community in your Communities tab.'
              : 'This invitation has been used. Sign in to see your communities.',
          }
        : serverCode === 'INVITATION_EXPIRED'
          ? { title: 'Invitation expired', body: 'Ask whoever invited you to send a new link.' }
          : error instanceof ApiError && (error.code === 'not_found' || error.code === 'validation')
            ? {
                title: 'Invitation no longer valid',
                body: 'It may have been revoked, or the link was cut short when it was shared.',
              }
            : null;
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Invitation" />
        {state ? (
          <EmptyState
            title={state.title}
            body={state.body}
            action={{
              label: signedIn ? 'Explore communities' : 'Open Kinnoc',
              onPress: () => router.replace(signedIn ? '/communities' : '/'),
            }}
          />
        ) : (
          <EmptyState
            title="Couldn't load invitation"
            body={describeError(error)}
            action={{ label: 'Try again', onPress: () => void invitation.refetch() }}
          />
        )}
      </SafeAreaView>
    );
  }

  const inv = invitation.data;
  if (signedIn && existing.data?.membership === 'member') {
    return <Redirect href={`/community/${inv.community.id}`} />;
  }

  const continueToAccount = (path: '/sign-in' | '/sign-up') => {
    // After signing in (or signing up and onboarding), the app comes back here to accept.
    setPendingDestination(`/invite/${code}`);
    router.push(path);
  };

  const acceptError = accept.error ? acceptErrorMessage(accept.error) : null;
  const onPhoneBrowser =
    Platform.OS === 'web' && typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <SafeAreaView style={styles.root}>
      <MetaHead
        title={`Invitation to ${inv.community.name}`}
        description={inv.community.description}
        image={inv.community.photoUrl}
        url={buildDeepLinkUrl('invite', code)}
      />
      <ScreenHeader title="Invitation" />
      <View style={styles.content}>
        <View style={styles.card}>
          <CommunityAvatar id={inv.community.id} monogram={inv.community.monogram} uri={inv.community.photoUrl} size={72} />
          <Text variant="screenTitle" style={styles.title} numberOfLines={2}>
            {inv.community.name}
          </Text>
          <View style={styles.badge}>
            <Mail size={14} color={colors.primary} />
            <Text variant="meta" color="primary">
              Community Invite
            </Text>
          </View>
          <Text variant="post" color="textSecondary" style={styles.body}>
            {inv.invitedBy
              ? `${inv.invitedBy.displayName} invited you to join ${inv.community.name} on Kinnoc.`
              : `You're invited to join ${inv.community.name} on Kinnoc.`}
          </Text>
          {inv.community.description ? (
            <Text variant="message" color="textSecondary" style={styles.body} numberOfLines={4}>
              {inv.community.description}
            </Text>
          ) : null}
          <Text variant="meta" color="textTertiary" style={styles.body}>
            Expires {formatDay(inv.expiresAt)}
          </Text>
          {acceptError ? <Banner tone="warning" message={acceptError} style={styles.banner} /> : null}
          <View style={styles.actions}>
            {signedIn ? (
              <Button
                label="Accept invitation"
                loading={accept.isPending}
                onPress={() =>
                  accept.mutate(inv.community.id, {
                    onSuccess: (id) => router.replace(`/community/${id}`),
                  })
                }
              />
            ) : (
              <>
                <Button label="Sign in to accept" onPress={() => continueToAccount('/sign-in')} />
                <Button label="Create an account" variant="quiet" onPress={() => continueToAccount('/sign-up')} />
              </>
            )}
            {onPhoneBrowser ? (
              // Opening this https link inside the browser does not hand it to the app (iOS only
              // does that for links opened from elsewhere), so offer the app explicitly. Only on tap.
              <Button
                label="Open in the Kinnoc app"
                variant="text"
                onPress={() => void Linking.openURL(`kinnoc://invite/${encodeURIComponent(code)}`)}
              />
            ) : null}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function acceptErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.serverCode === 'FORBIDDEN') {
      return 'This invitation was sent to a different account. Sign in with the invited account to accept it.';
    }
    if (error.serverCode === 'USER_NOT_PROVISIONED' || error.serverCode === 'PROFILE_REQUIRED') {
      return 'Finish setting up your profile, then open the invitation again.';
    }
  }
  return `The invitation wasn't accepted. ${describeError(error)}`;
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
    marginBottom: space[3],
  },
  banner: {
    width: '100%',
    marginBottom: space[3],
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: space[2],
  },
});
