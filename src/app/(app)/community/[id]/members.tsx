import { useLocalSearchParams } from 'expo-router';
import { Crown, ShieldCheck, ShieldOff, UserMinus } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { CommunityMember, CommunityRole } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/Header';
import { ActionSheet, ConfirmDialog, type SheetAction } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useCommunity, useCommunityAdmin, useMembers } from '@/features/communities/hooks';
import { useMe } from '@/features/profile/hooks';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter, space } from '@/theme';

const ROLE_LABEL: Record<CommunityRole, string | null> = { owner: 'Owner', moderator: 'Moderator', member: null };

type Pending = { kind: 'remove' | 'transfer'; member: CommunityMember } | null;

export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const members = useMembers(id);
  const me = useMe();
  const admin = useCommunityAdmin(id);
  const toast = useToast();
  const pull = usePullToRefresh(members.refetch);
  const [menuFor, setMenuFor] = useState<CommunityMember | null>(null);
  const [confirm, setConfirm] = useState<Pending>(null);
  const items = flatten(members.data);
  const myRole = community.data?.role ?? null;

  const done = (message: string) => () => {
    toast.show({ message, aboveNav: false });
    void members.refetch();
  };
  const fail = (what: string) => (e: unknown) => toast.show({ message: `${what} ${describeError(e)}`, aboveNav: false });

  /** What the viewer may do to this member, following the API's permission matrix. */
  const actionsFor = (m: CommunityMember): SheetAction[] => {
    if (m.username === me.data?.username || m.role === 'owner') return [];
    const actions: SheetAction[] = [];
    if (myRole === 'owner') {
      actions.push(
        m.role === 'moderator'
          ? {
              label: 'Make a member',
              icon: ShieldOff,
              onPress: () => admin.setRole.mutate({ username: m.username, role: 'member' }, { onSuccess: done(`${m.displayName} is now a member`), onError: fail("Couldn't change the role.") }),
            }
          : {
              label: 'Make a moderator',
              icon: ShieldCheck,
              onPress: () => admin.setRole.mutate({ username: m.username, role: 'moderator' }, { onSuccess: done(`${m.displayName} is now a moderator`), onError: fail("Couldn't change the role.") }),
            },
        { label: 'Make owner', icon: Crown, onPress: () => setConfirm({ kind: 'transfer', member: m }) },
      );
    }
    if (myRole === 'owner' || (myRole === 'moderator' && m.role === 'member')) {
      actions.push({ label: 'Remove from community', icon: UserMinus, destructive: true, onPress: () => setConfirm({ kind: 'remove', member: m }) });
    }
    return actions;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Members" subtitle={community.data?.name} />
      {members.isPending ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.username}
          renderItem={({ item }) => {
            const actions = actionsFor(item);
            const role = ROLE_LABEL[item.role];
            const isMe = item.username === me.data?.username;
            return (
              <Pressable
                style={styles.row}
                onPress={actions.length ? () => setMenuFor(item) : undefined}
                disabled={!actions.length}
                accessibilityRole={actions.length ? 'button' : undefined}
                accessibilityLabel={[item.displayName, isMe ? 'you' : null, role].filter(Boolean).join(', ')}
                accessibilityHint={actions.length ? 'Opens member actions' : undefined}
                pressedOpacity={0.7}
              >
                <Avatar name={item.displayName} uri={item.avatarUrl} size={44} />
                <View style={styles.body}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {item.displayName}
                    {isMe ? ' (you)' : ''}
                  </Text>
                  <Text variant="meta" color="textTertiary" numberOfLines={1}>
                    @{item.username}
                  </Text>
                </View>
                {role ? (
                  <Text variant="meta" color={item.role === 'owner' ? 'primary' : 'textSecondary'}>
                    {role}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <Hairline inset={gutter + 44 + space[3]} />}
          ListEmptyComponent={
            members.isError ? (
              <ErrorState error={members.error} onRetry={() => members.refetch()} />
            ) : (
              <Text variant="post" color="textSecondary" style={styles.empty}>
                No members yet.
              </Text>
            )
          }
          ListFooterComponent={<ListFooter loading={members.isFetchingNextPage} />}
          onEndReached={() => members.hasNextPage && !members.isFetchingNextPage && members.fetchNextPage()}
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}

      <ActionSheet visible={!!menuFor} title={menuFor?.displayName} onClose={() => setMenuFor(null)} actions={menuFor ? actionsFor(menuFor) : []} />

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.kind === 'transfer' ? `Make ${confirm.member.displayName} the owner?` : `Remove ${confirm?.member.displayName}?`}
        body={
          confirm?.kind === 'transfer'
            ? "They'll be able to edit the community and manage everyone, including you. You'll become a moderator."
            : community.data?.joinPolicy === 'open'
              ? 'They lose access to the conversation straight away. Open communities let them join again.'
              : 'They lose access to the conversation straight away.'
        }
        confirmLabel={confirm?.kind === 'transfer' ? 'Make owner' : 'Remove'}
        destructive
        loading={admin.remove.isPending || admin.transfer.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, member } = confirm;
          const close = () => setConfirm(null);
          if (kind === 'transfer') {
            admin.transfer.mutate(member.username, {
              onSuccess: () => {
                close();
                done(`${member.displayName} now owns the community`)();
              },
              onError: (e) => {
                close();
                fail("Couldn't transfer ownership.")(e);
              },
            });
          } else {
            admin.remove.mutate(member.username, {
              onSuccess: () => {
                close();
                done(`${member.displayName} was removed`)();
              },
              onError: (e) => {
                close();
                fail("Couldn't remove them.")(e);
              },
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingVertical: space[3], minHeight: 64 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  empty: { padding: space[6] },
});
