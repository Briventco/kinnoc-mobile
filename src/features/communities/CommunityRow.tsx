import { AtSign, BellOff, Check, CheckCheck, ImageIcon, Pin } from 'lucide-react-native';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Community, InboxEntry } from '@/api/types';
import { CommunityAvatar, CountBadge } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { formatInboxTime, plural } from '@/lib/format';
import { colors, gutter, size, space } from '@/theme';

import { statusForSeq } from './receipts';

interface InboxRowProps {
  entry: InboxEntry;
  onPress: () => void;
  onLongPress: () => void;
}

const TICK_LABEL = { sent: 'sent', delivered: 'delivered to everyone', read: 'seen by everyone' } as const;

/** One line of the inbox, built to scan like a chat app and show what is alive. */
export const InboxRow = memo(function InboxRow({ entry, onPress, onLongPress }: InboxRowProps) {
  const { community, lastMessage, unreadCount, hasMention, isMuted, isPinned, typing, receipts } = entry;
  const unread = unreadCount > 0;
  // Your own last message shows its tick, as in the conversation.
  const tick = lastMessage?.isMine && lastMessage.seq != null ? statusForSeq(lastMessage.seq, receipts) : null;
  const typingText = typing.length ? `${typing.length === 1 ? typing[0] : `${typing[0]} and ${typing.length - 1} more`} ${typing.length === 1 ? 'is' : 'are'} typing…` : null;

  const a11y = [
    community.name,
    isPinned ? 'pinned' : null,
    isMuted ? 'muted' : null,
    unread ? `${unreadCount} unread` : null,
    hasMention ? 'you were mentioned' : null,
    typingText ?? (lastMessage ? `${lastMessage.senderName}: ${lastMessage.kind === 'photo' ? 'Sent a photo' : lastMessage.text}` : 'No messages yet'),
    tick && !typingText ? TICK_LABEL[tick] : null,
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
              {tick ? (
                tick === 'sent' ? (
                  <Check size={16} color={colors.textTertiary} strokeWidth={2} />
                ) : (
                  <CheckCheck size={16} color={tick === 'read' ? colors.primary : colors.textTertiary} strokeWidth={2} />
                )
              ) : null}
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
  community: Community;
  onPress: () => void;
  onJoin: () => void;
  joining: boolean;
}

/** How a community is entered, in a few words for the row's second line. */
function accessLabel(c: Community) {
  if (c.visibility === 'private') return 'Private';
  if (c.joinPolicy === 'approval') return 'Approval needed';
  if (c.joinPolicy === 'invite-only') return 'Invite only';
  return null;
}

/** A community to discover: identity, category and members, and the action that fits the viewer. */
export function BrowseRow({ community, onPress, onJoin, joining }: BrowseRowProps) {
  const access = accessLabel(community);
  const { membership, joinPolicy } = community;
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={[community.name, community.category, plural(community.memberCount, 'member'), access].filter(Boolean).join(', ')}
      pressedOpacity={0.7}
    >
      <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={size.communityLg} />
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {community.name}
        </Text>
        <Text variant="preview" color="textTertiary" numberOfLines={1}>
          {community.category} · {plural(community.memberCount, 'member')}
          {access ? ` · ${access}` : ''}
        </Text>
      </View>
      {membership === 'member' ? (
        <Button label="Joined" variant="joined" size="small" onPress={onPress} />
      ) : membership === 'pending' ? (
        <Button label="Requested" variant="joined" size="small" onPress={onPress} />
      ) : membership === 'invited' ? (
        <Button label="Invited" variant="join" size="small" onPress={onPress} accessibilityHint="Opens the invitation" />
      ) : joinPolicy === 'invite-only' ? null : (
        <Button
          label={joinPolicy === 'approval' ? 'Request' : 'Join'}
          variant="join"
          size="small"
          loading={joining}
          onPress={onJoin}
          accessibilityHint={joinPolicy === 'approval' ? `Asks to join ${community.name}` : `Joins ${community.name}`}
        />
      )}
    </Pressable>
  );
}

/** An invitation waiting for the viewer, or a request they sent, above the inbox. */
export function PendingRow({ community, onPress, children }: { community: Community; onPress: () => void; children?: ReactNode }) {
  const invited = community.membership === 'invited';
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={invited ? `Invitation to ${community.name}` : `Request to join ${community.name}, waiting for approval`}
      pressedOpacity={0.7}
    >
      <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={size.communityLg} />
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {community.name}
        </Text>
        <Text variant="preview" color={invited ? 'primary' : 'textTertiary'} numberOfLines={1}>
          {invited ? 'You’re invited to join' : 'Waiting for approval'}
        </Text>
      </View>
      {children}
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
