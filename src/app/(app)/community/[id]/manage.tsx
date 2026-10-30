import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Person } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { ScreenHeader } from '@/components/Header';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Tabs } from '@/components/Tabs';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { validateUsername } from '@/features/auth/validation';
import { useCommunity, useCommunityAdmin, useInvitations, useJoinRequests } from '@/features/communities/hooks';
import { VerifiedName } from '@/features/verification/VerifiedBadge';
import { flatten } from '@/lib/cache';
import { formatInboxTime } from '@/lib/format';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter, space } from '@/theme';

type Tab = 'requests' | 'invitations';

/** Owners and moderators: review join requests and manage invitations. */
export default function ManageCommunity() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const community = useCommunity(id);
  const [current, setCurrent] = useState<Tab>(tab === 'invitations' ? 'invitations' : 'requests');
  const requests = useJoinRequests(id);
  const count = flatten(requests.data).length;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Manage" subtitle={community.data?.name} />
      <Tabs<Tab>
        items={[
          { key: 'requests', label: 'Requests', count },
          { key: 'invitations', label: 'Invitations' },
        ]}
        value={current}
        onChange={setCurrent}
      />
      {current === 'requests' ? <Requests id={id} /> : <Invitations id={id} />}
    </SafeAreaView>
  );
}

function PersonRow({ person, detail, children }: { person: Person; detail: string; children: React.ReactNode }) {
  return (
    <View style={styles.row} accessible={false}>
      <Avatar name={person.displayName} uri={person.avatarUrl} size={44} />
      <View style={styles.body}>
        <VerifiedName name={person.displayName} username={person.username} variant="rowTitle" />
        <Text variant="meta" color="textTertiary" numberOfLines={1}>
          @{person.username} · {detail}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function Requests({ id }: { id: string }) {
  const requests = useJoinRequests(id);
  const admin = useCommunityAdmin(id);
  const toast = useToast();
  const pull = usePullToRefresh(requests.refetch);
  const items = flatten(requests.data);
  const busy = (username: string) =>
    (admin.approve.isPending && admin.approve.variables === username) || (admin.reject.isPending && admin.reject.variables === username);
  const after = (message: string) => ({
    onSuccess: () => {
      toast.show({ message, aboveNav: false });
      void requests.refetch();
    },
    onError: (e: unknown) => {
      toast.show({ message: describeError(e), aboveNav: false });
      void requests.refetch();
    },
  });

  if (requests.isPending) return <SkeletonList />;
  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.user.username}
      renderItem={({ item }) => (
        <PersonRow person={item.user} detail={`asked ${formatInboxTime(item.requestedAt)}`}>
          <Button label="Decline" variant="quiet" size="small" disabled={busy(item.user.username)} onPress={() => admin.reject.mutate(item.user.username, after('Request declined'))} />
          <Button
            label="Approve"
            variant="join"
            size="small"
            loading={admin.approve.isPending && admin.approve.variables === item.user.username}
            disabled={busy(item.user.username)}
            onPress={() => admin.approve.mutate(item.user.username, after(`${item.user.displayName} joined`))}
          />
        </PersonRow>
      )}
      ItemSeparatorComponent={() => <Hairline inset={gutter + 44 + space[3]} />}
      ListEmptyComponent={
        requests.isError ? (
          <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
        ) : (
          <EmptyState title="No requests" body="When someone asks to join, you can approve or decline them here." />
        )
      }
      ListFooterComponent={<ListFooter loading={requests.isFetchingNextPage} />}
      onEndReached={() => requests.hasNextPage && !requests.isFetchingNextPage && requests.fetchNextPage()}
      refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
    />
  );
}

function Invitations({ id }: { id: string }) {
  const invitations = useInvitations(id);
  const admin = useCommunityAdmin(id);
  const toast = useToast();
  const pull = usePullToRefresh(invitations.refetch);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const items = flatten(invitations.data);

  const invite = () => {
    const name = username.trim().replace(/^@/, '').toLowerCase();
    const problem = validateUsername(name);
    setError(problem);
    if (problem) return;
    admin.invite.mutate(name, {
      onSuccess: (inv) => {
        setUsername('');
        toast.show({ message: `Invited ${inv.user.displayName}`, aboveNav: false });
        void invitations.refetch();
      },
      onError: (e) => setError(e instanceof ApiError ? describeError(e) : "Couldn't send the invitation."),
    });
  };

  return (
    <FlatList
      data={invitations.isPending ? [] : items}
      keyExtractor={(i) => i.user.username}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.inviteForm}>
          <TextField
            label="Invite by username"
            value={username}
            onChangeText={(v) => {
              setUsername(v);
              setError(null);
            }}
            error={error}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="username"
            returnKeyType="send"
            onSubmitEditing={invite}
          />
          <Button label="Send invitation" onPress={invite} loading={admin.invite.isPending} disabled={!username.trim()} style={styles.inviteButton} />
        </View>
      }
      renderItem={({ item }) => (
        <PersonRow person={item.user} detail={`invited ${formatInboxTime(item.invitedAt)}${item.invitedBy ? ` by ${item.invitedBy.displayName}` : ''}`}>
          <Button
            label="Revoke"
            variant="warning"
            size="small"
            loading={admin.revoke.isPending && admin.revoke.variables === item.user.username}
            onPress={() =>
              admin.revoke.mutate(item.user.username, {
                onSuccess: () => {
                  toast.show({ message: 'Invitation revoked', aboveNav: false });
                  void invitations.refetch();
                },
                onError: (e) => toast.show({ message: describeError(e), aboveNav: false }),
              })
            }
          />
        </PersonRow>
      )}
      ItemSeparatorComponent={() => <Hairline inset={gutter + 44 + space[3]} />}
      ListEmptyComponent={
        invitations.isPending ? (
          <SkeletonList rows={2} />
        ) : invitations.isError ? (
          <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />
        ) : (
          <Text variant="post" color="textSecondary" style={styles.empty}>
            No pending invitations. People you invite appear here until they accept or decline.
          </Text>
        )
      }
      ListFooterComponent={<ListFooter loading={invitations.isFetchingNextPage} />}
      onEndReached={() => invitations.hasNextPage && !invitations.isFetchingNextPage && invitations.fetchNextPage()}
      refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingVertical: space[3], minHeight: 64 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', gap: space[2] },
  inviteForm: { padding: gutter, gap: space[3] },
  inviteButton: { alignSelf: 'flex-start' },
  empty: { padding: space[6] },
});
