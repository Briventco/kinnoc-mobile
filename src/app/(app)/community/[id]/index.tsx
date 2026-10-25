import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, EllipsisVertical, Lock, Pin, Reply, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Community, Message } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, ListFooter } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { ChatComposer } from '@/features/communities/ChatComposer';
import {
  lostAccess,
  useCommunity,
  useConversationEvents,
  useDeleteMessage,
  useMarkCommunityRead,
  useMessages,
  useReact,
  useRealtimeStatus,
  useSendMessage,
} from '@/features/communities/hooks';
import { accessCopy, MembershipActions } from '@/features/communities/MembershipActions';
import { DateSeparator, MessageBubble, TypingBubble } from '@/features/communities/MessageBubble';
import { useMe } from '@/features/profile/hooks';
import { flatten } from '@/lib/cache';
import { formatDateSeparator, isSameDay, plural, uid } from '@/lib/format';
import { keys, queryClient } from '@/lib/query';
import { api, realtime } from '@/services';
import { colors, gutter, radius, shadow, space } from '@/theme';

const GROUP_GAP_MS = 3 * 60_000;
const REACTIONS = ['👍', '🙌', '🔥', '❤️', '😂', '🎉'];

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
        <CenteredSpinner />
      </View>
    );
  }
  if (community.isError) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header()}
        <ErrorState error={community.error} onRetry={() => community.refetch()} />
      </View>
    );
  }
  if (community.data.membership !== 'member') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header()}
        <JoinGate community={community.data} />
      </View>
    );
  }
  return <Conversation community={community.data} renderHeader={header} />;
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

type Row = { type: 'message'; message: Message; showHeader: boolean } | { type: 'date'; key: string; label: string };

const senderKey = (m: Message) => (m.isMine ? 'me' : (m.sender?.username ?? 'former'));

function Conversation({ community, renderHeader }: { community: Community; renderHeader: (subtitle?: string) => React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const me = useMe();
  const messages = useMessages(community.id, true);
  const send = useSendMessage(community.id, me.data);
  const react = useReact(community.id);
  const remove = useDeleteMessage(community.id);
  const markRead = useMarkCommunityRead();
  const connection = useRealtimeStatus();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null);
  const lastTyping = useRef(0);

  // Removed, left on another device, or the community became invisible: show the gate again.
  const onLostAccess = useCallback(() => {
    toast.show({ message: `You're no longer a member of ${community.name}`, aboveNav: false });
    queryClient.removeQueries({ queryKey: keys.messages(community.id) });
    void queryClient.invalidateQueries({ queryKey: keys.community(community.id) });
    void queryClient.invalidateQueries({ queryKey: keys.inbox });
  }, [community.id, community.name, toast]);

  const { typing } = useConversationEvents(community.id, true, onLostAccess);

  useEffect(() => {
    if (messages.isError && lostAccess(messages.error)) void queryClient.invalidateQueries({ queryKey: keys.community(community.id) });
  }, [messages.isError, messages.error, community.id]);

  const list = flatten(messages.data); // newest first

  // Mark read up to the newest message the server has, whenever it changes while open.
  const newestId = list.find((m) => m.seq !== null)?.id;
  useEffect(() => {
    if (newestId) markRead.mutate({ id: community.id, lastMessageId: newestId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId, community.id]);

  /** Inverted list rows: messages with date separators placed after (i.e. above) each day's oldest message. */
  const rows = useMemo(() => {
    const out: Row[] = [];
    list.forEach((m, i) => {
      const older = list[i + 1];
      const startsRun =
        !older ||
        senderKey(older) !== senderKey(m) ||
        new Date(m.sentAt).getTime() - new Date(older.sentAt).getTime() > GROUP_GAP_MS ||
        !isSameDay(m.sentAt, older.sentAt);
      out.push({ type: 'message', message: m, showHeader: startsRun });
      if (!older || !isSameDay(m.sentAt, older.sentAt)) {
        out.push({ type: 'date', key: `date-${m.id}`, label: formatDateSeparator(m.sentAt) });
      }
    });
    return out;
  }, [list]);

  const sendMessage = (text: string, attachmentUris: string[]) => {
    send.mutate(
      {
        clientId: uid(),
        text,
        attachmentUris,
        replyTo: replyTo
          ? { id: replyTo.id, senderName: replyTo.isMine ? 'You' : (replyTo.sender?.displayName ?? 'Former member'), text: replyTo.text }
          : null,
      },
      {
        onError: (e) => {
          if (lostAccess(e)) return;
          // The bubble shows "Not sent"; explain only what retrying will not fix.
          if (e instanceof ApiError && (e.code === 'validation' || e.code === 'rate_limited')) {
            toast.show({ message: describeError(e), aboveNav: false });
          }
        },
      },
    );
    setReplyTo(null);
  };

  const retry = useCallback(
    (m: Message) =>
      send.mutate({
        clientId: m.clientId ?? m.id,
        text: m.text,
        replyTo: m.replyTo,
        attachmentUris: m.attachments.map((a) => a.url),
      }),
    [send],
  );

  const onReact = useCallback((m: Message, emoji: string, add: boolean) => react.mutate({ messageId: m.id, emoji, add }), [react]);

  const canModerate = community.role === 'owner' || community.role === 'moderator';
  const typingLabel = typing.length ? `${typing[0]} ${typing.length > 1 ? `and ${typing.length - 1} more are` : 'is'} typing…` : undefined;
  const connectingLabel = realtime.live && (connection === 'connecting' || connection === 'offline') ? 'Connecting…' : undefined;

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {renderHeader(typingLabel ?? connectingLabel)}
      {community.pinned ? (
        <Pressable
          style={styles.pinned}
          onPress={() => router.push({ pathname: '/community/[id]/info', params: { id: community.id } })}
          accessibilityRole="button"
          accessibilityLabel={`Pinned: ${community.pinned.title}. ${community.pinned.body}`}
        >
          <Pin size={16} color={colors.primary} strokeWidth={2} />
          <Text variant="preview" numberOfLines={1} style={styles.flex}>
            <Text variant="name" style={styles.pinnedTitle}>
              Pinned
            </Text>{' '}
            {community.pinned.title}: {community.pinned.body}
          </Text>
          <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.75} />
        </Pressable>
      ) : null}

      {messages.isPending ? (
        <CenteredSpinner />
      ) : messages.isError && !list.length ? (
        lostAccess(messages.error) ? (
          <CenteredSpinner />
        ) : (
          <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
        )
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => (r.type === 'date' ? r.key : (r.message.clientId ?? r.message.id))}
          renderItem={({ item }) =>
            item.type === 'date' ? (
              <DateSeparator label={item.label} />
            ) : (
              <MessageBubble message={item.message} showHeader={item.showHeader} onLongPress={setActionsFor} onReact={onReact} onRetry={retry} />
            )
          }
          ListHeaderComponent={
            <>
              {typing.length ? <TypingBubble names={typing} /> : null}
              <View style={{ height: space[3] }} />
            </>
          }
          ListFooterComponent={
            messages.hasNextPage ? (
              <ListFooter loading={messages.isFetchingNextPage} />
            ) : list.length ? (
              <Text variant="meta" color="textTertiary" style={styles.start}>
                This is the start of {community.name}.
              </Text>
            ) : (
              <Text variant="post" color="textSecondary" style={styles.start}>
                No messages yet. Say hello to the community.
              </Text>
            )
          }
          onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />
      )}

      <ChatComposer
        communityName={community.name}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={sendMessage}
        allowAttachments={api.capabilities.messageAttachments}
        onTyping={() => {
          // The server drops pings more often than every 2 s; this keeps the client under that.
          const now = Date.now();
          if (now - lastTyping.current > 3000) {
            lastTyping.current = now;
            realtime.sendTyping(community.id);
          }
        }}
        bottomInset={insets.bottom}
      />

      <MessageActions
        message={actionsFor}
        reactions={api.capabilities.reactions}
        canDelete={!!actionsFor && actionsFor.seq !== null && (actionsFor.isMine || canModerate)}
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => {
          if (!actionsFor) return;
          const mine = actionsFor.reactions.find((r) => r.emoji === emoji)?.reactedByMe;
          onReact(actionsFor, emoji, !mine);
        }}
        onReply={() => setReplyTo(actionsFor)}
        onDelete={() => setConfirmDelete(actionsFor)}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title="Delete this message?"
        body={
          confirmDelete?.isMine
            ? 'It will show as deleted for everyone in the community.'
            : `You're removing ${confirmDelete?.sender?.displayName ?? 'this member'}'s message as a ${community.role}. It will show as deleted for everyone.`
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          remove.mutate(target.id, { onError: (e) => toast.show({ message: `Couldn't delete. ${describeError(e)}`, aboveNav: false }) });
        }}
      />
    </KeyboardAvoidingView>
  );
}

function MessageActions({
  message,
  reactions,
  canDelete,
  onClose,
  onReact,
  onReply,
  onDelete,
}: {
  message: Message | null;
  reactions: boolean;
  canDelete: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[3] }]} accessibilityViewIsModal>
        <Text variant="preview" color="textSecondary" numberOfLines={2} style={styles.sheetQuote}>
          {message?.text}
        </Text>
        {reactions ? (
          <View style={styles.reactionRow}>
            {REACTIONS.map((e) => {
              const mine = message?.reactions.find((r) => r.emoji === e)?.reactedByMe;
              return (
                <Pressable
                  key={e}
                  onPress={() => {
                    onReact(e);
                    onClose();
                  }}
                  style={[styles.reactionPick, mine && styles.reactionPickMine]}
                  accessibilityRole="button"
                  accessibilityLabel={mine ? `Remove ${e} reaction` : `React with ${e}`}
                >
                  <Emoji size={24}>{e}</Emoji>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {message?.seq !== null ? (
          <Pressable
            style={styles.sheetItem}
            onPress={() => {
              onReply();
              onClose();
            }}
            accessibilityRole="button"
          >
            <Reply size={20} color={colors.text} strokeWidth={1.75} />
            <Text variant="tab">Reply</Text>
          </Pressable>
        ) : null}
        {canDelete ? (
          <Pressable
            style={styles.sheetItem}
            onPress={() => {
              onClose();
              onDelete();
            }}
            accessibilityRole="button"
          >
            <Trash2 size={20} color={colors.warning} strokeWidth={1.75} />
            <Text variant="tab" color="warning">
              Delete
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: gutter,
    minHeight: 48,
    backgroundColor: colors.surface2,
  },
  pinnedTitle: { fontSize: 14 },
  start: { textAlign: 'center', padding: space[6] },
  gate: { padding: space[6], gap: space[3] },
  gateActions: { marginTop: space[2] },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space[4],
    ...shadow.float,
  },
  sheetQuote: { paddingHorizontal: gutter + 4, paddingBottom: space[3] },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: gutter, paddingBottom: space[2] },
  reactionPick: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  reactionPickMine: { backgroundColor: colors.primarySubtle, borderWidth: 1, borderColor: colors.primarySubtleStrong },
  sheetItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter + 4 },
});
