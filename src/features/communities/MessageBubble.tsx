import { Image } from 'expo-image';
import { Check, CheckCheck, CircleAlert, Clock, Play, Reply } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import type { DeliveryStatus, Message } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Emoji } from '@/components/Emoji';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { formatTime } from '@/lib/format';
import { openExternal } from '@/lib/links';
import { colors, gutter, radius, space } from '@/theme';

interface MessageBubbleProps {
  message: Message;
  /** For the viewer's own messages: the tick to show, from the conversation's receipts. Defaults to `message.status`. */
  status?: DeliveryStatus;
  /** First message in a run from the same sender: show avatar, name and time. */
  showHeader: boolean;
  onLongPress: (message: Message) => void;
  onReact: (message: Message, emoji: string, add: boolean) => void;
  onRetry: (message: Message) => void;
}

/** Other people on a light neutral, you in navy. Name and time sit above incoming bubbles. */
export const MessageBubble = memo(function MessageBubble({ message, status, showHeader, onLongPress, onReact, onRetry }: MessageBubbleProps) {
  const mine = message.isMine;
  const failed = message.status === 'failed';
  const deleted = !!message.deletedAt;
  const senderName = message.sender?.displayName ?? 'Former member';

  const bubble = (
    <Pressable
      onLongPress={() => !failed && !deleted && message.status !== 'sending' && onLongPress(message)}
      onPress={failed ? () => onRetry(message) : undefined}
      delayLongPress={300}
      pressedOpacity={0.85}
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={`${mine ? 'You' : senderName}, ${formatTime(message.sentAt)}: ${deleted ? 'Message deleted' : message.text}${failed ? '. Not sent. Double tap to retry.' : ''}`}
      accessibilityHint={failed || deleted ? undefined : 'Long press for actions'}
      style={[
        styles.bubble,
        mine ? styles.mine : styles.theirs,
        !showHeader && (mine ? styles.mineCont : styles.theirsCont),
        failed && styles.failed,
        deleted && styles.deleted,
      ]}
    >
      {deleted ? (
        <Text variant="message" color="textTertiary">
          {mine ? 'You deleted this message' : 'Message deleted'}
        </Text>
      ) : null}
      {message.replyTo && !deleted ? (
        <View style={styles.inset}>
          <View style={styles.replyHead}>
            <Reply size={14} color={colors.brandNavy} strokeWidth={2} />
            <Text variant="meta" color="brandNavy" style={styles.replyName} numberOfLines={1}>
              {message.replyTo.senderName}
            </Text>
          </View>
          <Text variant="preview" color="textSecondary" numberOfLines={1}>
            {message.replyTo.text}
          </Text>
        </View>
      ) : null}
      {message.text && !deleted ? (
        <Text variant="message" color={mine ? 'onPrimary' : 'text'} selectable>
          {message.text}
        </Text>
      ) : null}
      {message.attachments.map((a) => (
        <Image
          key={a.id}
          source={{ uri: a.url }}
          style={[styles.attachment, { aspectRatio: Math.max(0.75, Math.min(1.6, a.width / a.height)) }]}
          contentFit="cover"
          accessibilityLabel={a.alt ?? 'Photo'}
        />
      ))}
      {message.link ? (
        <Pressable
          style={[styles.inset, styles.link]}
          onPress={() => void openExternal(message.link!.url)}
          accessibilityRole="link"
          accessibilityLabel={`${message.link.title}, ${message.link.domain}`}
        >
          <View style={styles.thumb}>
            {message.link.thumbnailUrl ? <Image source={{ uri: message.link.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {message.link.isVideo ? (
              <View style={styles.play}>
                <Play size={16} color={colors.onPrimary} fill={colors.onPrimary} strokeWidth={1.75} />
              </View>
            ) : null}
          </View>
          <View style={styles.flex}>
            <Text variant="name" numberOfLines={2}>
              {message.link.title}
            </Text>
            <Text variant="meta" color="textTertiary" numberOfLines={1}>
              {message.link.domain}
              {message.link.detail ? ` · ${message.link.detail}` : ''}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </Pressable>
  );

  return (
    <View style={[styles.wrap, showHeader && styles.wrapGap]}>
      {mine ? (
        <View style={styles.mineCol}>
          {bubble}
          <Reactions message={message} onReact={onReact} alignEnd />
          {deleted ? null : <DeliveryLine message={message} status={status ?? message.status} onRetry={onRetry} />}
        </View>
      ) : (
        <View style={styles.theirsRow}>
          <View style={styles.avatarCol}>
            {showHeader ? <Avatar name={senderName} uri={message.sender?.avatarUrl} size={32} /> : null}
          </View>
          <View style={styles.theirsCol}>
            {showHeader ? (
              <Text variant="meta" color="textTertiary" style={styles.senderLine}>
                <Text variant="name" style={styles.senderName}>
                  {senderName}
                </Text>{' '}
                {formatTime(message.sentAt)}
              </Text>
            ) : null}
            {bubble}
            <Reactions message={message} onReact={onReact} />
          </View>
        </View>
      )}
    </View>
  );
});

function Reactions({ message, onReact, alignEnd }: { message: Message; onReact: MessageBubbleProps['onReact']; alignEnd?: boolean }) {
  if (!message.reactions.length) return null;
  return (
    <View style={[styles.reactions, alignEnd && styles.reactionsEnd]}>
      {message.reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onReact(message, r.emoji, !r.reactedByMe)}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} ${r.count}${r.reactedByMe ? ', you reacted' : ''}`}
          accessibilityHint={r.reactedByMe ? 'Removes your reaction' : 'Adds your reaction'}
          style={[styles.reaction, r.reactedByMe && styles.reactionMine]}
          hitSlop={6}
        >
          <Emoji>{r.emoji}</Emoji>
          <Text variant="meta" color={r.reactedByMe ? 'brandNavy' : 'text'} style={styles.reactionText}>
            {r.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Sending (clock), Sent (one tick), Delivered to everyone (two grey ticks), Seen by everyone (two blue ticks). */
const DELIVERY: Record<Exclude<DeliveryStatus, 'failed'>, { label: string; spoken: string; Icon: typeof Check; color: string }> = {
  sending: { label: 'Sending', spoken: 'Sending', Icon: Clock, color: colors.textTertiary },
  sent: { label: 'Sent', spoken: 'Sent', Icon: Check, color: colors.textTertiary },
  delivered: { label: 'Delivered', spoken: 'Delivered to everyone', Icon: CheckCheck, color: colors.textTertiary },
  read: { label: 'Seen', spoken: 'Seen by everyone', Icon: CheckCheck, color: colors.primary },
};

function DeliveryLine({ message, status, onRetry }: { message: Message; status: DeliveryStatus; onRetry: (m: Message) => void }) {
  if (status === 'failed') {
    return (
      <Pressable onPress={() => onRetry(message)} style={styles.delivery} accessibilityRole="button" hitSlop={8}>
        <CircleAlert size={14} color={colors.warning} strokeWidth={2} />
        <Text variant="meta" color="warning">
          Not sent. Tap to retry
        </Text>
      </Pressable>
    );
  }
  const { label, spoken, Icon, color } = DELIVERY[status];
  const time = formatTime(message.sentAt);
  return (
    <View style={styles.delivery} accessible accessibilityLabel={status === 'sending' ? spoken : `${time}, ${spoken}`}>
      <Text variant="meta" color="textTertiary">
        {status === 'sending' ? label : `${time} · ${label}`}
      </Text>
      <Icon size={15} color={color} strokeWidth={2} />
    </View>
  );
}

/** Three dots that pulse in turn, in an incoming bubble, while other members type. */
export function TypingBubble({ names }: { names: string[] }) {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.stagger(
        160,
        dots.map((v) =>
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    pulse.start();
    return () => pulse.stop();
  }, [dots]);

  if (!names.length) return null;
  const label = names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : `${names[0]} and ${names.length - 1} others are typing`;
  return (
    <View style={[styles.wrap, styles.wrapGap]} accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={styles.theirsRow}>
        <View style={styles.avatarCol} />
        <View style={styles.theirsCol}>
          <Text variant="meta" color="textTertiary" style={styles.senderLine}>
            {label}
          </Text>
          <View style={[styles.bubble, styles.theirs, styles.typing]}>
            {dots.map((opacity, i) => (
              <Animated.View key={i} style={[styles.dot, { opacity }]} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

/** Caps label between two hairlines. */
export function DateSeparator({ label }: { label: string }) {
  return (
    <View style={styles.separator} accessibilityRole="header">
      <View style={styles.rule} />
      <Text variant="label" color="textTertiary">
        {label}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  wrap: { paddingHorizontal: gutter, paddingTop: 4 },
  wrapGap: { paddingTop: space[4] },
  mineCol: { alignItems: 'flex-end', paddingLeft: 48 },
  theirsRow: { flexDirection: 'row', gap: 10, paddingRight: 32 },
  avatarCol: { width: 32 },
  theirsCol: { flex: 1, alignItems: 'flex-start' },
  senderLine: { marginBottom: 4 },
  senderName: { fontFamily: 'Figtree_700Bold', fontSize: 14 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.bubble, gap: 8, maxWidth: '100%' },
  theirs: { backgroundColor: colors.bubbleIncoming, borderTopLeftRadius: radius.tail },
  mine: { backgroundColor: colors.bubbleOutgoing, borderTopRightRadius: radius.tail },
  theirsCont: { borderTopLeftRadius: radius.bubble },
  mineCont: { borderTopRightRadius: radius.bubble },
  failed: { opacity: 0.7 },
  deleted: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  inset: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  replyName: { fontFamily: 'Figtree_700Bold' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 },
  thumb: { width: 56, height: 56, borderRadius: radius.tag, overflow: 'hidden', backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  play: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  attachment: { width: 220, maxWidth: '100%', borderRadius: radius.md, backgroundColor: colors.surface3 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  reactionsEnd: { justifyContent: 'flex-end' },
  reaction: { height: 28, paddingHorizontal: 8, borderRadius: radius.tag, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  reactionMine: { backgroundColor: colors.primarySubtle, borderWidth: 1, borderColor: colors.primarySubtleStrong },
  reactionText: { fontFamily: 'Figtree_600SemiBold' },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 20 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textTertiary },
  separator: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingTop: space[5], paddingBottom: space[1] },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
});
