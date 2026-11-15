import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Pin, Reply, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable as RNPressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Message, MessagePage, Receipts } from '@/api/types';
import { Emoji } from '@/components/Emoji';
import { KeyboardAvoidingView } from '@/components/KeyboardAvoidingView';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, ListFooter, MessageSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { flatten } from '@/lib/cache';
import { formatDateSeparator, isSameDay, plural, uid } from '@/lib/format';
import { KEYBOARD_BEHAVIOR, useKeyboardHeight } from '@/lib/useKeyboardVisible';
import { api, realtime } from '@/services';
import { colors, gutter, radius, shadow, space } from '@/theme';

import { ChatComposer } from './ChatComposer';
import { lostAccess, type OutgoingMessage } from './hooks';
import { DateSeparator, MessageBubble, TypingBubble } from './MessageBubble';
import { deliveryStatus } from './receipts';

const GROUP_GAP_MS = 3 * 60_000;
/** Within this distance of the newest message, new messages keep it in view. */
const NEAR_LATEST_PX = 120;
const REACTIONS = ['👍', '🙌', '🔥', '❤️', '😂', '🎉'];

type Row = { type: 'message'; message: Message; showHeader: boolean } | { type: 'date'; key: string; label: string };

const senderKey = (m: Message) => (m.isMine ? 'me' : (m.sender?.username ?? 'former'));
/** Stable across the optimistic bubble and the server's copy of your own message. */
const messageKey = (m: Message) => m.clientId ?? m.id;

export interface ConversationViewProps {
  conversationName: string;
  pinned?: { title: string; body: string } | null;
  onPressPinned?: () => void;
  renderHeader: (subtitle?: string) => React.ReactNode;
  targetMessageId?: string;
  messages: UseInfiniteQueryResult<InfiniteData<MessagePage, unknown>, Error>;
  receipts: Receipts | null;
  typing: string[];
  connection: 'idle' | 'connecting' | 'connected' | 'offline';
  canModerate: boolean;
  moderatorRoleLabel?: string;
  canSendMessages?: boolean;
  readOnlyNotice?: string;
  onSend: (out: OutgoingMessage, options?: { onError?: (error: unknown) => void }) => void;
  onReact: (params: { messageId: string; emoji: string; add: boolean }) => void;
  onDeleteMessage: (messageId: string, options?: { onError?: (error: unknown) => void }) => void;
  deletingMessage?: boolean;
  onMarkRead: (lastMessageId: string) => void;
  onSendTyping: () => void;
  onRefreshAccess?: () => void;
}

/**
 * Shared conversation screen body used by both community-level chats and community sub-group chats.
 * Reuses Kinnoc's optimistic sending, receipts, reactions, attachments, replies, and realtime cache.
 */
export function ConversationView({
  conversationName,
  pinned,
  onPressPinned,
  renderHeader,
  targetMessageId,
  messages,
  receipts,
  typing,
  connection,
  canModerate,
  moderatorRoleLabel = 'moderator',
  canSendMessages = true,
  readOnlyNotice,
  onSend,
  onReact,
  onDeleteMessage,
  deletingMessage = false,
  onMarkRead,
  onSendTyping,
  onRefreshAccess,
}: ConversationViewProps) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null);
  const lastTyping = useRef(0);
  const listRef = useRef<FlatList<Row>>(null);
  const [atLatest, setAtLatest] = useState(true);
  const [lastSeenKey, setLastSeenKey] = useState<string | null>(null);

  useEffect(() => {
    if (messages.isError && lostAccess(messages.error)) {
      onRefreshAccess?.();
    }
  }, [messages.isError, messages.error, onRefreshAccess]);

  const list = flatten(messages.data);
  const unseen = atLatest || !lastSeenKey ? 0 : Math.max(0, list.findIndex((m) => messageKey(m) === lastSeenKey));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const near = e.nativeEvent.contentOffset.y < NEAR_LATEST_PX;
    if (near === atLatest) return;
    setAtLatest(near);
    setLastSeenKey(near ? null : list[0] ? messageKey(list[0]) : null);
  };
  const scrollToLatest = () => listRef.current?.scrollToOffset({ offset: 0, animated: true });

  const newestId = list.find((m) => m.seq !== null)?.id;
  useEffect(() => {
    if (newestId) onMarkRead(newestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

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

  useEffect(() => {
    if (!targetMessageId || !rows.length) return;
    const index = rows.findIndex((r) => r.type === 'message' && r.message.id === targetMessageId);
    if (index >= 0) {
      const t = setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        } catch {
          // List layout may still be initializing
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [targetMessageId, rows]);

  const keyboardHeight = useKeyboardHeight();
  useEffect(() => {
    if (keyboardHeight > 0 && atLatest) {
      const t = setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [keyboardHeight, atLatest]);

  const sendMessage = (text: string, attachmentUris: string[]) => {
    onSend(
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
          if (e instanceof ApiError && (e.code === 'validation' || e.code === 'rate_limited')) {
            toast.show({ message: describeError(e), aboveNav: false });
          }
        },
      },
    );
    setReplyTo(null);
    scrollToLatest();
  };

  const retry = useCallback(
    (m: Message) =>
      onSend({
        clientId: m.clientId ?? m.id,
        text: m.text,
        replyTo: m.replyTo,
        attachmentUris: m.attachments.map((a) => a.url),
      }),
    [onSend],
  );

  const handleReact = useCallback((m: Message, emoji: string, add: boolean) => onReact({ messageId: m.id, emoji, add }), [onReact]);

  const typingLabel = typing.length ? `${typing[0]} ${typing.length > 1 ? `and ${typing.length - 1} more are` : 'is'} typing…` : undefined;
  const connectingLabel = realtime.live && (connection === 'connecting' || connection === 'offline') ? 'Connecting…' : undefined;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.fixedHeader}>
        {renderHeader(typingLabel ?? connectingLabel)}
        {pinned ? (
          <Pressable
            style={styles.pinned}
            onPress={onPressPinned}
            accessibilityRole="button"
            accessibilityLabel={`Pinned: ${pinned.title}. ${pinned.body}`}
          >
            <Pin size={16} color={colors.primary} strokeWidth={2} />
            <Text variant="preview" numberOfLines={1} style={styles.flex}>
              <Text variant="name" style={styles.pinnedTitle}>
                Pinned
              </Text>{' '}
              {pinned.title}: {pinned.body}
            </Text>
            <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.75} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_BEHAVIOR}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + (pinned ? 108 : 60) : 0}
      >
        {messages.isPending ? (
          <MessageSkeleton />
        ) : messages.isError && !list.length ? (
          lostAccess(messages.error) ? (
            <CenteredSpinner />
          ) : (
            <ErrorState error={messages.error} onRetry={() => messages.refetch()} />
          )
        ) : (
          <View style={styles.flex}>
            <FlatList
              ref={listRef}
              inverted
              data={rows}
              keyExtractor={(r) => (r.type === 'date' ? r.key : messageKey(r.message))}
              renderItem={({ item }) =>
                item.type === 'date' ? (
                  <DateSeparator label={item.label} />
                ) : (
                  <MessageBubble
                    message={item.message}
                    status={deliveryStatus(item.message, receipts)}
                    showHeader={item.showHeader}
                    onLongPress={setActionsFor}
                    onReact={handleReact}
                    onRetry={retry}
                  />
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
                    This is the start of {conversationName}.
                  </Text>
                ) : (
                  <Text variant="post" color="textSecondary" style={styles.start}>
                    No messages yet. Say hello to {conversationName}.
                  </Text>
                )
              }
              onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
              onEndReachedThreshold={0.4}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onScroll={onScroll}
              scrollEventThrottle={100}
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: NEAR_LATEST_PX }}
            />
            {!atLatest ? (
              <Pressable
                onPress={() => scrollToLatest()}
                style={styles.jump}
                accessibilityRole="button"
                accessibilityLabel={unseen ? `${plural(unseen, 'new message')}. Jump to latest` : 'Jump to latest message'}
                pressedOpacity={0.8}
              >
                {unseen ? (
                  <Text variant="label" color="primary">
                    {unseen > 99 ? '99+' : unseen} new
                  </Text>
                ) : null}
                <ChevronDown size={20} color={colors.text} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        )}

        {canSendMessages ? (
          <ChatComposer
            communityName={conversationName}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={sendMessage}
            allowAttachments={api.capabilities.messageAttachments}
            onTyping={() => {
              const now = Date.now();
              if (now - lastTyping.current > 3000) {
                lastTyping.current = now;
                onSendTyping();
              }
            }}
            bottomInset={insets.bottom}
          />
        ) : (
          <View style={[styles.readOnlyBar, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
            <Text variant="meta" color="textTertiary" style={styles.readOnlyText}>
              {readOnlyNotice ?? 'Only permitted members can send messages in this conversation.'}
            </Text>
          </View>
        )}

        <MessageActions
          message={actionsFor}
          reactions={api.capabilities.reactions}
          canReply={canSendMessages}
          canDelete={!!actionsFor && actionsFor.seq !== null && (actionsFor.isMine || canModerate)}
          onClose={() => setActionsFor(null)}
          onReact={(emoji) => {
            if (!actionsFor) return;
            const mine = actionsFor.reactions.find((r) => r.emoji === emoji)?.reactedByMe;
            handleReact(actionsFor, emoji, !mine);
          }}
          onReply={() => setReplyTo(actionsFor)}
          onDelete={() => setConfirmDelete(actionsFor)}
        />

        <ConfirmDialog
          visible={!!confirmDelete}
          title="Delete this message?"
          body={
            confirmDelete?.isMine
              ? 'It will show as deleted for everyone.'
              : `You're removing ${confirmDelete?.sender?.displayName ?? 'this member'}'s message as a ${moderatorRoleLabel}. It will show as deleted for everyone.`
          }
          confirmLabel="Delete"
          destructive
          loading={deletingMessage}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            if (!target) return;
            onDeleteMessage(target.id, {
              onError: (e) => toast.show({ message: `Couldn't delete. ${describeError(e)}`, aboveNav: false }),
            });
          }}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageActions({
  message,
  reactions,
  canReply,
  canDelete,
  onClose,
  onReact,
  onReply,
  onDelete,
}: {
  message: Message | null;
  reactions: boolean;
  canReply: boolean;
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
        {canReply && message?.seq !== null ? (
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
  root: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  fixedHeader: { zIndex: 10, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
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
  jump: {
    position: 'absolute',
    right: gutter,
    bottom: space[3],
    minWidth: 44,
    height: 44,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[1],
    ...shadow.float,
  },
  readOnlyBar: {
    paddingHorizontal: gutter,
    paddingTop: space[3],
    backgroundColor: colors.surface2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  readOnlyText: { textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space[4],
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    ...shadow.float,
  },
  sheetQuote: { paddingHorizontal: gutter + 4, paddingBottom: space[3] },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: gutter, paddingBottom: space[2] },
  reactionPick: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPickMine: {
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primarySubtleStrong,
  },
  sheetItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter + 4 },
});
