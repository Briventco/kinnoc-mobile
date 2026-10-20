import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, EllipsisVertical, Lock, Pin, Reply } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Community, Message } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, ListFooter } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { ChatComposer } from '@/features/communities/ChatComposer';
import {
  useCommunity,
  useConversationEvents,
  useJoinCommunity,
  useMarkCommunityRead,
  useMessages,
  useReact,
  useSendMessage,
} from '@/features/communities/hooks';
import { DateSeparator, MessageBubble } from '@/features/communities/MessageBubble';
import { useMe } from '@/features/profile/hooks';
import { flatten } from '@/lib/cache';
import { formatDateSeparator, isSameDay, plural, uid } from '@/lib/format';
import { realtime } from '@/services';
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

/** Non-members never receive messages; they see what the community is and how to join. */
function JoinGate({ community }: { community: Community }) {
  const join = useJoinCommunity();
  const toast = useToast();
  const pending = community.membership === 'pending';
  return (
    <View style={styles.gate}>
      <Lock size={22} color={colors.textTertiary} strokeWidth={1.75} />
      <Text variant="section">{pending ? 'Your request is waiting' : `Join ${community.name} to see the conversation`}</Text>
      <Text variant="post" color="textSecondary">
        {pending ? "A moderator will review it. You'll get a notification when you're in." : community.description}
      </Text>
      {!pending ? (
        <Button
          label={community.visibility === 'private' ? 'Request to join' : 'Join community'}
          loading={join.isPending}
          onPress={() => join.mutate(community.id, { onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}`, aboveNav: false }) })}
          style={styles.gateButton}
        />
      ) : null}
    </View>
  );
}

type Row = { type: 'message'; message: Message; showHeader: boolean } | { type: 'date'; key: string; label: string };

function Conversation({ community, renderHeader }: { community: Community; renderHeader: (subtitle?: string) => React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const messages = useMessages(community.id, true);
  const send = useSendMessage(community.id, me.data);
  const react = useReact(community.id);
  const markRead = useMarkCommunityRead();
  const { typing } = useConversationEvents(community.id, true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const lastTyping = useRef(0);

  const list = flatten(messages.data); // newest first

  // Mark read when the newest message changes while the conversation is open.
  const newestId = list.find((m) => !m.isMine || m.status !== 'sending')?.id;
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
        !older || older.sender.id !== m.sender.id || new Date(m.sentAt).getTime() - new Date(older.sentAt).getTime() > GROUP_GAP_MS || !isSameDay(m.sentAt, older.sentAt);
      out.push({ type: 'message', message: m, showHeader: startsRun });
      if (!older || !isSameDay(m.sentAt, older.sentAt)) {
        out.push({ type: 'date', key: `date-${m.id}`, label: formatDateSeparator(m.sentAt) });
      }
    });
    return out;
  }, [list]);

  const sendMessage = (text: string, attachmentUris: string[]) => {
    send.mutate({
      clientId: uid(),
      text,
      attachmentUris,
      replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.isMine ? 'You' : replyTo.sender.displayName, text: replyTo.text } : null,
    });
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

  const typingLabel = typing.length ? `${typing[0]} ${typing.length > 1 ? `and ${typing.length - 1} more are` : 'is'} typing…` : undefined;
  const forbidden = messages.error instanceof ApiError && messages.error.code === 'forbidden';

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {renderHeader(typingLabel)}
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
        forbidden ? (
          <JoinGate community={{ ...community, membership: 'none' }} />
        ) : (
          <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
        )
      ) : (
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => (r.type === 'date' ? r.key : r.message.clientId ?? r.message.id)}
          renderItem={({ item }) =>
            item.type === 'date' ? (
              <DateSeparator label={item.label} />
            ) : (
              <MessageBubble message={item.message} showHeader={item.showHeader} onLongPress={setActionsFor} onReact={onReact} onRetry={retry} />
            )
          }
          ListHeaderComponent={<View style={{ height: space[3] }} />}
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
        onTyping={() => {
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
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => {
          if (!actionsFor) return;
          const mine = actionsFor.reactions.find((r) => r.emoji === emoji)?.reactedByMe;
          onReact(actionsFor, emoji, !mine);
        }}
        onReply={() => setReplyTo(actionsFor)}
      />
    </KeyboardAvoidingView>
  );
}

function MessageActions({
  message,
  onClose,
  onReact,
  onReply,
}: {
  message: Message | null;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[3] }]} accessibilityViewIsModal>
        <Text variant="preview" color="textSecondary" numberOfLines={2} style={styles.sheetQuote}>
          {message?.text}
        </Text>
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
  gateButton: { alignSelf: 'flex-start', marginTop: space[2] },
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
