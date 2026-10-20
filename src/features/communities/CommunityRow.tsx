import { AtSign, BellOff, ImageIcon, Pin } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CommunitySummary, InboxEntry, MembershipStatus } from '@/api/types';
import { CommunityAvatar, CountBadge } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { formatInboxTime, plural } from '@/lib/format';
import { colors, gutter, size, space } from '@/theme';

interface InboxRowProps {
  entry: InboxEntry;
  onPress: () => void;
  onLongPress: () => void;
}

/** One line of the inbox, built to scan like a chat app and show what is alive. */
export const InboxRow = memo(function InboxRow({ entry, onPress, onLongPress }: InboxRowProps) {
  const { community, lastMessage, unreadCount, hasMention, isMuted, isPinned, typing } = entry;
  const unread = unreadCount > 0;
  const typingText = typing.length ? `${typing.length === 1 ? typing[0] : `${typing[0]} and ${typing.length - 1} more`} ${typing.length === 1 ? 'is' : 'are'} typing…` : null;

  const a11y = [
    community.name,
    isPinned ? 'pinned' : null,
    isMuted ? 'muted' : null,
    unread ? `${unreadCount} unread` : null,
    hasMention ? 'you were mentioned' : null,
    typingText ?? (lastMessage ? `${lastMessage.senderName}: ${lastMessage.kind === 'photo' ? 'Sent a photo' : lastMessage.text}` : 'No messages yet'),
    lastMessage ? formatInboxTime(lastMessage.sentAt) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Opens the conversation. Long press for more options."
      style={styles.row}
      pressedOpacity={0.7}
    >
      <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={size.communityLg} />
      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.nameRow}>
            <Text variant={unread ? 'rowTitleUnread' : 'rowTitle'} numberOfLines={1} style={styles.shrink}>
              {community.name}
            </Text>
            {isPinned ? <Pin size={13} color={colors.textTertiary} strokeWidth={2} /> : null}
            {isMuted ? <BellOff size={13} color={colors.textTertiary} strokeWidth={2} /> : null}
          </View>
          {lastMessage ? (
            <Text variant="meta" color={unread && !isMuted ? 'primary' : 'textTertiary'} style={unread && !isMuted && styles.timeUnread}>
              {formatInboxTime(lastMessage.sentAt)}
            </Text>
          ) : null}
        </View>
        <View style={styles.line}>
          {typingText ? (
            <Text variant="preview" color="primary" style={[styles.shrink, styles.typing]} numberOfLines={1}>
              {typingText}
            </Text>
          ) : lastMessage ? (
            <View style={[styles.preview, styles.shrink]}>
              <Text variant="preview" color={unread ? 'text' : 'textTertiary'} numberOfLines={1} style={styles.shrink}>
                <Text variant="preview" color={unread ? 'text' : 'textSecondary'} style={styles.sender}>
                  {lastMessage.senderName}:
                </Text>{' '}
                {lastMessage.kind === 'photo' ? '' : lastMessage.text}
              </Text>
              {lastMessage.kind === 'photo' ? (
                <>
                  <ImageIcon size={16} color={colors.textTertiary} strokeWidth={1.75} />
                  <Text variant="preview" color={unread ? 'text' : 'textTertiary'}>
                    Sent a photo
                  </Text>
                </>
              ) : null}
            </View>
          ) : (
            <Text variant="preview" color="textTertiary" style={styles.shrink}>
              No messages yet. Say hello.
            </Text>
          )}
          <View style={styles.badges}>
            {hasMention ? (
              <View style={styles.mention}>
                <AtSign size={13} color={colors.primary} strokeWidth={2.2} />
              </View>
            ) : null}
            <CountBadge count={unreadCount} muted={isMuted} />
          </View>
        </View>
      </View>
    </Pressable>
  );
});

interface BrowseRowProps {
  community: CommunitySummary & { description?: string };
  membership: MembershipStatus;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
}

/** A community to discover: identity, category and members, and a Join action. */
export function BrowseRow({ community, membership, onPress, onJoin, joining }: BrowseRowProps) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={`${community.name}, ${community.category}, ${plural(community.memberCount, 'member')}`} pressedOpacity={0.7}>
      <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={size.communityLg} />
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {community.name}
        </Text>
        <Text variant="preview" color="textTertiary" numberOfLines={1}>
          {community.category} · {plural(community.memberCount, 'member')}
          {community.visibility === 'private' ? ' · Private' : ''}
        </Text>
      </View>
      {membership === 'member' ? (
        <Button label="Joined" variant="joined" size="small" onPress={onPress} />
      ) : membership === 'pending' ? (
        <Button label="Requested" variant="joined" size="small" onPress={onPress} />
      ) : (
        <Button
          label={community.visibility === 'private' ? 'Request' : 'Join'}
          variant="join"
          size="small"
          loading={joining}
          onPress={onJoin}
          accessibilityHint={`Joins ${community.name}`}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: gutter,
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  timeUnread: { fontFamily: 'Figtree_700Bold' },
  typing: { fontFamily: 'Figtree_600SemiBold', flex: 1 },
  preview: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sender: { fontFamily: 'Figtree_600SemiBold' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  mention: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' },
});
