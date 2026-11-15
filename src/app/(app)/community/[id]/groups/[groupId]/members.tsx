import { useLocalSearchParams } from 'expo-router';
import { Ellipsis, ShieldCheck, ShieldOff, UserMinus, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { CommunityGroupMember, GroupRole } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog, type SheetAction } from '@/components/Overlays';
import { EmptyState, ErrorState, Hairline, ListFooter, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { validateUsername } from '@/features/auth/validation';
import { useCommunityGroup, useGroupAdmin, useGroupMembers } from '@/features/communities/groupHooks';
import { ProfileLink } from '@/features/profile/ProfileLink';
import { useMe } from '@/features/profile/hooks';
import { VerifiedName } from '@/features/verification/VerifiedBadge';
import { flatten } from '@/lib/cache';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter, space } from '@/theme';

const ROLE_LABEL: Record<GroupRole, string | null> = {
  admin: 'Admin',
  member: null,
};

export default function GroupMembersScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const group = useCommunityGroup(id, groupId);
  const members = useGroupMembers(id, groupId);
  const admin = useGroupAdmin(id, groupId);
  const me = useMe();
  const toast = useToast();
  const pull = usePullToRefresh(members.refetch);

  const [username, setUsername] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<CommunityGroupMember | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<CommunityGroupMember | null>(null);

  const items = flatten(members.data);
  const canManage = Boolean(group.data?.permissions.canManageMembers);

  const onAdd = () => {
    const clean = username.trim().replace(/^@/, '').toLowerCase();
    const problem = validateUsername(clean);
    setAddError(problem);
    if (problem) return;

    admin.addMember.mutate(
      { username: clean },
      {
        onSuccess: (added) => {
          setUsername('');
          toast.show({ message: `${added.displayName} added to group`, aboveNav: false });
          void members.refetch();
        },
        onError: (e) => setAddError(describeError(e)),
      },
    );
  };

  const actionsFor = (m: CommunityGroupMember): SheetAction[] => {
    if (!canManage || m.username === me.data?.username) return [];
    const actions: SheetAction[] = [];
    if (m.role !== 'admin') {
      actions.push({
        label: 'Make group admin',
        icon: ShieldCheck,
        onPress: () =>
          admin.setMemberRole.mutate(
            { username: m.username, role: 'admin' },
            {
              onSuccess: () => toast.show({ message: `${m.displayName} is now a group admin`, aboveNav: false }),
              onError: (e) => toast.show({ message: describeError(e), aboveNav: false }),
            },
          ),
      });
    } else {
      actions.push({
        label: 'Make regular member',
        icon: ShieldOff,
        onPress: () =>
          admin.setMemberRole.mutate(
            { username: m.username, role: 'member' },
            {
              onSuccess: () => toast.show({ message: `${m.displayName} is now a member`, aboveNav: false }),
              onError: (e) => toast.show({ message: describeError(e), aboveNav: false }),
            },
          ),
      });
    }
    actions.push({
      label: 'Remove from group',
      icon: UserMinus,
      destructive: true,
      onPress: () => setConfirmRemove(m),
    });
    return actions;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Group members" subtitle={group.data?.name} />

      {members.isPending ? (
        <SkeletonList />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.username}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            canManage ? (
              <View style={styles.addBox}>
                <TextField
                  label="Add community member"
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    setAddError(null);
                  }}
                  error={addError}
                  placeholder="username"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={onAdd}
                />
                <Button
                  label="Add member"
                  icon={UserPlus}
                  size="small"
                  loading={admin.addMember.isPending}
                  disabled={!username.trim()}
                  onPress={onAdd}
                  style={styles.addButton}
                />
              </View>
            ) : undefined
          }
          renderItem={({ item }) => {
            const actions = actionsFor(item);
            const roleLabel = ROLE_LABEL[item.role];
            const isMe = item.username === me.data?.username;
            return (
              <View style={styles.row}>
                <ProfileLink
                  username={item.username}
                  label={`${item.displayName}'s profile`}
                  style={styles.person}
                >
                  <Avatar name={item.displayName} uri={item.avatarUrl} size={44} />
                  <View style={styles.body}>
                    <VerifiedName
                      name={`${item.displayName}${isMe ? ' (you)' : ''}`}
                      username={item.username}
                      variant="rowTitle"
                    />
                    <Text variant="meta" color="textTertiary" numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                </ProfileLink>
                {roleLabel ? (
                  <Text
                    variant="meta"
                    color={item.role === 'admin' ? 'primary' : 'textSecondary'}
                    style={!actions.length && styles.roleEnd}
                  >
                    {roleLabel}
                  </Text>
                ) : null}
                {actions.length ? (
                  <IconButton
                    icon={Ellipsis}
                    label={`Manage ${item.displayName}`}
                    onPress={() => setMenuFor(item)}
                  />
                ) : null}
              </View>
            );
          }}
          ItemSeparatorComponent={() => <Hairline inset={gutter + 44 + space[3]} />}
          ListEmptyComponent={
            <EmptyState
              title="No members yet"
              body="Members added to this group will appear here."
            />
          }
          ListFooterComponent={<ListFooter loading={members.isFetchingNextPage} />}
          onEndReached={() =>
            members.hasNextPage && !members.isFetchingNextPage && members.fetchNextPage()
          }
          refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}
        />
      )}

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.displayName}
        actions={menuFor ? actionsFor(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />

      <ConfirmDialog
        visible={!!confirmRemove}
        title={`Remove ${confirmRemove?.displayName}?`}
        body="They will lose access to this group's conversation."
        confirmLabel="Remove"
        destructive
        loading={admin.removeMember.isPending}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          if (!confirmRemove) return;
          const target = confirmRemove;
          admin.removeMember.mutate(target.username, {
            onSuccess: () => {
              setConfirmRemove(null);
              toast.show({ message: `${target.displayName} removed`, aboveNav: false });
              void members.refetch();
            },
            onError: (e) => {
              setConfirmRemove(null);
              toast.show({ message: describeError(e), aboveNav: false });
            },
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  addBox: {
    paddingHorizontal: gutter,
    paddingVertical: space[4],
    gap: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  addButton: { alignSelf: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: gutter,
    paddingRight: gutter - 8,
    minHeight: 64,
    gap: space[2],
  },
  person: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingVertical: space[2],
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  roleEnd: { paddingRight: space[2] },
});
