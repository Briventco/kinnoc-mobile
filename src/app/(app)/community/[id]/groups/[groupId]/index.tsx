import { router, useLocalSearchParams } from 'expo-router';
import { EllipsisVertical, Lock } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { CommunityGroup } from '@/api/types';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { EmptyState, MessageSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { ConversationView } from '@/features/communities/ConversationView';
import {
  useCommunityGroup,
  useDeleteGroupMessage,
  useGroupConversationEvents,
  useGroupMessages,
  useGroupReact,
  useGroupReceipts,
  useJoinGroup,
  useMarkGroupRead,
  useSendGroupMessage,
} from '@/features/communities/groupHooks';
import { GroupAvatar } from '@/features/communities/GroupRow';
import { useCommunity, useRealtimeStatus } from '@/features/communities/hooks';
import { useMe } from '@/features/profile/hooks';
import { plural } from '@/lib/format';
import { keys, queryClient } from '@/lib/query';
import { realtime } from '@/services';
import { colors, space } from '@/theme';

export default function GroupConversationScreen() {
  const { id, groupId, messageId } = useLocalSearchParams<{ id: string; groupId: string; messageId?: string }>();
  const community = useCommunity(id);
  const group = useCommunityGroup(id, groupId);
  const insets = useSafeAreaInsets();

  const openGroupInfo = () =>
    router.push({ pathname: '/community/[id]/groups/[groupId]/info', params: { id, groupId } });

  const header = (subtitle?: string) => (
    <ScreenHeader
      center={
        group.data ? (
          <Pressable
            onPress={openGroupInfo}
            style={styles.identity}
            accessibilityRole="button"
            accessibilityLabel={`${group.data.name}, group info`}
          >
            <GroupAvatar group={group.data} dimension={40} />
            <View style={styles.flex}>
              <Text variant="rowTitle" numberOfLines={1}>
                {group.data.name}
              </Text>
              <Text
                variant="meta"
                color={subtitle?.endsWith('typing…') ? 'primary' : 'textTertiary'}
                numberOfLines={1}
              >
                {subtitle ??
                  [community.data?.name, plural(group.data.memberCount, 'member')].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Pressable>
        ) : null
      }
      right={<IconButton icon={EllipsisVertical} label="Group info" onPress={openGroupInfo} />}
    />
  );

  if (group.isPending) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header()}
        <MessageSkeleton />
      </View>
    );
  }

  if (group.isError) {
    const notFound =
      group.error instanceof ApiError &&
      (group.error.code === 'not_found' || group.error.serverCode === 'GROUP_NOT_FOUND');
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="Group"
          onBack={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/community/[id]/info', params: { id } }))}
        />
        <EmptyState
          title={notFound ? 'Group not found' : "Couldn't load group"}
          body={
            notFound
              ? 'This group may have been removed or is no longer available.'
              : describeError(group.error)
          }
          action={{
            label: notFound ? 'Back to Community' : 'Retry',
            onPress: () =>
              notFound
                ? router.navigate({ pathname: '/community/[id]/info', params: { id } })
                : void group.refetch(),
          }}
        />
      </View>
    );
  }

  if (group.data.membership !== 'member') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header()}
        <GroupJoinGate communityId={id} group={group.data} />
      </View>
    );
  }

  return (
    <GroupConversation
      communityId={id}
      group={group.data}
      renderHeader={header}
      targetMessageId={messageId}
    />
  );
}

function GroupJoinGate({ communityId, group }: { communityId: string; group: CommunityGroup }) {
  const join = useJoinGroup(communityId);
  const toast = useToast();

  const onJoin = () => {
    join.mutate(group.id, {
      onSuccess: (next) => {
        if (next.membership === 'member') {
          toast.show({ message: `You joined ${next.name}`, aboveNav: false });
        } else if (next.membership === 'pending') {
          toast.show({ message: 'Join request sent', aboveNav: false });
        }
      },
      onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}`, aboveNav: false }),
    });
  };

  return (
    <View style={styles.gate}>
      <Lock size={22} color={colors.textTertiary} strokeWidth={1.75} />
      <Text variant="section">
        {group.membership === 'pending'
          ? 'Your request is pending'
          : group.joinPolicy === 'invite-only'
            ? 'Invite-only group'
            : `Join ${group.name}`}
      </Text>
      <Text variant="post" color="textSecondary">
        {group.description || 'Join this group to view its messages and participate in the conversation.'}
      </Text>
      {group.permissions.canJoin && group.membership !== 'pending' ? (
        <View style={styles.gateActions}>
          <Button
            label={group.joinPolicy === 'approval' ? 'Request to join' : 'Join group'}
            loading={join.isPending}
            onPress={onJoin}
          />
        </View>
      ) : null}
    </View>
  );
}

function GroupConversation({
  communityId,
  group,
  renderHeader,
  targetMessageId,
}: {
  communityId: string;
  group: CommunityGroup;
  renderHeader: (subtitle?: string) => React.ReactNode;
  targetMessageId?: string;
}) {
  const toast = useToast();
  const me = useMe();
  const messages = useGroupMessages(communityId, group.id, true);
  const send = useSendGroupMessage(group.id, communityId, me.data);
  const react = useGroupReact(group.id);
  const remove = useDeleteGroupMessage(communityId, group.id);
  const markRead = useMarkGroupRead(communityId, group.id);
  const connection = useRealtimeStatus();

  const onLostAccess = useCallback(() => {
    toast.show({ message: `You're no longer a member of ${group.name}`, aboveNav: false });
    queryClient.removeQueries({ queryKey: keys.groupMessages(group.id) });
    void queryClient.invalidateQueries({ queryKey: keys.communityGroup(communityId, group.id) });
    void queryClient.invalidateQueries({ queryKey: keys.communityGroups(communityId) });
  }, [communityId, group.id, group.name, toast]);

  const { typing } = useGroupConversationEvents(group.id, communityId, true, onLostAccess);
  const receipts = useGroupReceipts(group.id);

  const onRefreshAccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.communityGroup(communityId, group.id) });
  }, [communityId, group.id]);

  return (
    <ConversationView
      conversationName={group.name}
      renderHeader={renderHeader}
      targetMessageId={targetMessageId}
      messages={messages}
      receipts={receipts}
      typing={typing}
      connection={connection}
      canModerate={group.role === 'admin'}
      moderatorRoleLabel={group.role ?? 'admin'}
      canSendMessages={group.permissions.canSendMessages}
      readOnlyNotice="Only group admins can send messages in this group."
      onSend={send.mutate}
      onReact={(params) => react.mutate(params)}
      onDeleteMessage={(messageId, opts) => remove.mutate(messageId, opts)}
      deletingMessage={remove.isPending}
      onMarkRead={(lastMessageId) => markRead.mutate(lastMessageId)}
      onSendTyping={() => realtime.sendTyping(`group:${group.id}`)}
      onRefreshAccess={onRefreshAccess}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  flex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gate: { padding: space[6], gap: space[3] },
  gateActions: { marginTop: space[2] },
});
