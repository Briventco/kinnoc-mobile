import { router, useLocalSearchParams } from 'expo-router';
import {
  Bell,
  BellOff,
  Lock,
  MessageSquareText,
  Pencil,
  Trash2,
  Unlock,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { GroupJoinPolicy, GroupRole } from '@/api/types';
import { api } from '@/services';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { SettingRow } from '@/features/settings/SettingRow';
import {
  useCommunityGroup,
  useDeleteGroup,
  useJoinGroup,
  useLeaveGroup,
  useMuteGroup,
} from '@/features/communities/groupHooks';
import { GroupAvatar } from '@/features/communities/GroupRow';
import { useCommunity } from '@/features/communities/hooks';
import { plural } from '@/lib/format';
import { colors, gutter, radius, space } from '@/theme';

const POLICY_COPY: Record<GroupJoinPolicy, { label: string; icon: typeof Unlock }> = {
  open: { label: 'Open to community members', icon: Unlock },
  approval: { label: 'Requires approval to join', icon: UserCheck },
  'invite-only': { label: 'Invite only', icon: Lock },
};

const ROLE_LABEL: Record<GroupRole, string> = {
  admin: 'Group Admin',
  member: 'Member',
};

export default function GroupInfoScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const community = useCommunity(id);
  const group = useCommunityGroup(id, groupId);
  const join = useJoinGroup(id);
  const leave = useLeaveGroup(id);
  const remove = useDeleteGroup(id, groupId);
  const mute = useMuteGroup(id, groupId);
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (group.isPending) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Group info" />
        <CenteredSpinner />
      </SafeAreaView>
    );
  }

  if (group.isError) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Group info" />
        <ErrorState error={group.error} onRetry={() => void group.refetch()} />
      </SafeAreaView>
    );
  }

  const g = group.data;
  const isMember = g.membership === 'member';
  const policy = POLICY_COPY[g.joinPolicy];
  const PolicyIcon = policy.icon;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Group info" subtitle={community.data?.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <GroupAvatar group={g} dimension={72} />
          <Text variant="pageTitle" accessibilityRole="header">
            {g.name}
          </Text>
          <View style={styles.metaRow}>
            <PolicyIcon size={15} color={colors.textTertiary} strokeWidth={1.75} />
            <Text variant="meta" color="textTertiary">
              {policy.label} · {plural(g.memberCount, 'member')}
            </Text>
          </View>
          {isMember && g.role ? (
            <Text variant="meta" color="primary">
              {ROLE_LABEL[g.role]}
            </Text>
          ) : null}
          {g.description ? (
            <Text variant="post" color="textSecondary">
              {g.description}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {isMember ? (
              <Button
                label="Open group chat"
                icon={MessageSquareText}
                onPress={() =>
                  router.push({ pathname: '/community/[id]/groups/[groupId]', params: { id, groupId: g.id } })
                }
              />
            ) : g.membership === 'pending' ? (
              <Button label="Request sent" variant="joined" disabled />
            ) : g.permissions.canJoin ? (
              <Button
                label={g.joinPolicy === 'approval' ? 'Request to join' : 'Join group'}
                loading={join.isPending}
                onPress={() =>
                  join.mutate(g.id, {
                    onSuccess: (next) => {
                      toast.show({
                        message:
                          next.membership === 'member' ? `You joined ${next.name}` : 'Join request sent',
                        aboveNav: false,
                      });
                    },
                    onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}`, aboveNav: false }),
                  })
                }
              />
            ) : null}
          </View>
        </View>

        <View style={styles.rows}>
          <Hairline />
          <SettingRow
            icon={Users}
            label="Members"
            detail={
              g.permissions.canManageMembers
                ? `${plural(g.memberCount, 'member')} · Manage`
                : plural(g.memberCount, 'member')
            }
            onPress={() =>
              router.push({
                pathname: '/community/[id]/groups/[groupId]/members',
                params: { id, groupId: g.id },
              })
            }
          />
          {g.permissions.canEdit ? (
            <>
              <Hairline />
              <SettingRow
                icon={Pencil}
                label="Edit group"
                detail="Name, description, icon, and join policy"
                onPress={() =>
                  router.push({
                    pathname: '/community/[id]/groups/[groupId]/edit',
                    params: { id, groupId: g.id },
                  })
                }
              />
            </>
          ) : null}
          {api.capabilities.groupMute && isMember ? (
            <>
              <Hairline />
              <Pressable
                style={styles.settingRow}
                onPress={() => mute.mutate(!g.isMuted)}
                accessibilityRole="switch"
                accessibilityState={{ checked: g.isMuted }}
              >
                {g.isMuted ? (
                  <BellOff size={20} color={colors.text} strokeWidth={1.75} />
                ) : (
                  <Bell size={20} color={colors.text} strokeWidth={1.75} />
                )}
                <Text variant="tab" style={styles.flex}>
                  {g.isMuted ? 'Unmute notifications' : 'Mute notifications'}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Hairline />
        </View>

        {g.permissions.canLeave || g.permissions.canDelete ? (
          <View style={styles.dangerSection}>
            {g.permissions.canLeave ? (
              <Button
                label={`Leave ${g.name}`}
                variant="warning"
                onPress={() => setConfirmLeave(true)}
                style={styles.actionButton}
              />
            ) : null}
            {g.permissions.canDelete ? (
              <Button
                label="Delete group"
                variant="quiet"
                icon={Trash2}
                onPress={() => setConfirmDelete(true)}
                style={styles.actionButton}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmLeave}
        title={`Leave ${g.name}?`}
        body="You will stop receiving messages from this group."
        confirmLabel="Leave"
        destructive
        loading={leave.isPending}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() =>
          leave.mutate(g.id, {
            onSuccess: () => {
              setConfirmLeave(false);
              toast.show({ message: `You left ${g.name}`, aboveNav: false });
              router.dismissTo({ pathname: '/community/[id]/info', params: { id } });
            },
            onError: (e) => {
              setConfirmLeave(false);
              toast.show({ message: `Couldn't leave. ${describeError(e)}`, aboveNav: false });
            },
          })
        }
      />

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete ${g.name}?`}
        body="This permanently removes the group and its conversation history for all members."
        confirmLabel="Delete group"
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.show({ message: `${g.name} deleted`, aboveNav: false });
              router.dismissTo({ pathname: '/community/[id]/info', params: { id } });
            },
            onError: (e) => {
              setConfirmDelete(false);
              toast.show({ message: `Couldn't delete. ${describeError(e)}`, aboveNav: false });
            },
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingBottom: space[8] },
  identity: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { marginTop: space[1], alignItems: 'flex-start' },
  rows: { marginTop: space[6] },
  settingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter },
  dangerSection: { paddingHorizontal: gutter, marginTop: space[6], gap: space[3], alignItems: 'flex-start' },
  actionButton: { borderRadius: radius.field },
});
