import { router, useLocalSearchParams } from 'expo-router';
import { EllipsisVertical, Lock } from 'lucide-react-native';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Community } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { MetaHead } from '@/components/MetaHead';
import { Pressable } from '@/components/Pressable';
import { EmptyState, MessageSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { ConversationView } from '@/features/communities/ConversationView';
import {
  useCommunity,
  useConversationEvents,
  useDeleteMessage,
  useMarkCommunityRead,
  useMessages,
  useReact,
  useRealtimeStatus,
  useReceipts,
  useSendMessage,
} from '@/features/communities/hooks';
import { accessCopy, MembershipActions } from '@/features/communities/MembershipActions';
import { useMe } from '@/features/profile/hooks';
import { plural } from '@/lib/format';
import { keys, queryClient } from '@/lib/query';
import { realtime } from '@/services';
import { colors, space } from '@/theme';

export default function ConversationScreen() {
  const { id, messageId } = useLocalSearchParams<{ id: string; messageId?: string }>();
  const community = useCommunity(id);
  const insets = useSafeAreaInsets();

  const header = (subtitle?: string) => (
    <ScreenHeader
      center={
        community.data ? (
          <Pressable
            onPress={() => router.push({ pathname: '/community/[id]/info', params: { id } })}
            style={styles.identity}
            accessibilityRole="button"
            accessibilityLabel={`${community.data.name}, community info`}
          >
            <CommunityAvatar id={community.data.id} monogram={community.data.monogram} uri={community.data.photoUrl} size={40} />
            <View style={styles.flex}>
              <Text variant="rowTitle" numberOfLines={1}>
                {community.data.name}
              </Text>
              <Text variant="meta" color={subtitle?.endsWith('typing…') ? 'primary' : 'textTertiary'} numberOfLines={1}>
                {subtitle ?? plural(community.data.memberCount, 'member')}
              </Text>
            </View>
          </Pressable>
        ) : null
      }
      right={
        <IconButton
          icon={EllipsisVertical}
          label="Community info"
          onPress={() => router.push({ pathname: '/community/[id]/info', params: { id } })}
        />
      }
    />
  );

  if (community.isPending) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header()}
        <MessageSkeleton />
      </View>
    );
  }
  if (community.isError) {
    const notFound =
      community.error instanceof ApiError &&
      (community.error.code === 'not_found' || community.error.serverCode === 'COMMUNITY_NOT_FOUND');
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader
          title="Community"
          onBack={() => (router.canGoBack() ? router.back() : router.navigate('/communities'))}
        />
        <EmptyState
          title={notFound ? 'Community not found' : "Couldn't load community"}
          body={
            notFound
              ? 'This community may have been deleted, or the link is invalid.'
              : describeError(community.error)
          }
          action={{
            label: notFound ? 'Back to Communities' : 'Retry',
            onPress: () => (notFound ? router.navigate('/communities') : community.refetch()),
          }}
        />
      </View>
    );
  }
  if (community.data.membership !== 'member') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <MetaHead
          title={community.data.name}
          description={community.data.description}
          image={community.data.photoUrl}
          url={`https://web.kinnoc.app/community/${id}`}
        />
        {header()}
        <JoinGate community={community.data} />
      </View>
    );
  }
  return (
    <>
      <MetaHead
        title={community.data.name}
        description={community.data.description}
        image={community.data.photoUrl}
        url={`https://web.kinnoc.app/community/${id}`}
      />
      <CommunityConversation community={community.data} renderHeader={header} targetMessageId={messageId} />
    </>
  );
}

/** Non-members never receive messages; they see what the community is and how to get in. */
function JoinGate({ community }: { community: Community }) {
  const copy = accessCopy(community);
  return (
    <View style={styles.gate}>
      <Lock size={22} color={colors.textTertiary} strokeWidth={1.75} />
      <Text variant="section">{copy.title}</Text>
      <Text variant="post" color="textSecondary">
        {copy.body}
      </Text>
      <View style={styles.gateActions}>
        <MembershipActions community={community} />
      </View>
    </View>
  );
}

function CommunityConversation({
  community,
  renderHeader,
  targetMessageId,
}: {
  community: Community;
  renderHeader: (subtitle?: string) => React.ReactNode;
  targetMessageId?: string;
}) {
  const toast = useToast();
  const me = useMe();
  const messages = useMessages(community.id, true);
  const send = useSendMessage(community.id, me.data);
  const react = useReact(community.id);
  const remove = useDeleteMessage(community.id);
  const markRead = useMarkCommunityRead();
  const connection = useRealtimeStatus();

  const onLostAccess = useCallback(() => {
    toast.show({ message: `You're no longer a member of ${community.name}`, aboveNav: false });
    queryClient.removeQueries({ queryKey: keys.messages(community.id) });
    void queryClient.invalidateQueries({ queryKey: keys.community(community.id) });
    void queryClient.invalidateQueries({ queryKey: keys.inbox });
  }, [community.id, community.name, toast]);

  const { typing } = useConversationEvents(community.id, true, onLostAccess);
  const receipts = useReceipts(community.id);

  const onRefreshAccess = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.community(community.id) });
  }, [community.id]);

  return (
    <ConversationView
      conversationName={community.name}
      pinned={community.pinned}
      onPressPinned={() => router.push({ pathname: '/community/[id]/info', params: { id: community.id } })}
      renderHeader={renderHeader}
      targetMessageId={targetMessageId}
      messages={messages}
      receipts={receipts}
      typing={typing}
      connection={connection}
      canModerate={community.role === 'owner' || community.role === 'moderator'}
      moderatorRoleLabel={community.role ?? 'moderator'}
      onSend={send.mutate}
      onReact={(params) => react.mutate(params)}
      onDeleteMessage={(messageId, opts) => remove.mutate(messageId, opts)}
      deletingMessage={remove.isPending}
      onMarkRead={(lastMessageId) => markRead.mutate({ id: community.id, lastMessageId })}
      onSendTyping={() => realtime.sendTyping(community.id)}
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
