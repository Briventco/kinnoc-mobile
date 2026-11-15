import {
  BellOff,
  ChevronRight,
  Lock,
  Megaphone,
  MessagesSquare,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CommunityGroup, GroupRole } from '@/api/types';
import { CommunityAvatar, CountBadge } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { formatInboxTime, plural } from '@/lib/format';
import { colors, gutter, radius, size, space } from '@/theme';

const ICON_MAP = {
  'messages-square': MessagesSquare,
  megaphone: Megaphone,
  shield: Shield,
  sparkles: Sparkles,
  users: Users,
} as const;

export type GroupIconName = keyof typeof ICON_MAP;

export function GroupAvatar({
  group,
  dimension = 46,
}: {
  group: Pick<CommunityGroup, 'id' | 'monogram' | 'photoUrl' | 'iconName' | 'membership'>;
  dimension?: number;
}) {
  if (group.photoUrl) {
    return <CommunityAvatar id={group.id} monogram={group.monogram} uri={group.photoUrl} size={dimension} />;
  }
  const Icon = group.iconName && group.iconName in ICON_MAP ? ICON_MAP[group.iconName as GroupIconName] : Users;
  const isMember = group.membership === 'member';
  return (
    <View
      style={[
        styles.iconBadge,
        {
          width: dimension,
          height: dimension,
          borderRadius: Math.round(dimension * 0.28),
          backgroundColor: isMember ? colors.primarySubtle : colors.surface2,
        },
      ]}
    >
      <Icon size={Math.round(dimension * 0.45)} color={isMember ? colors.primary : colors.textSecondary} strokeWidth={1.85} />
    </View>
  );
}

const ROLE_LABEL: Record<GroupRole, string | null> = {
  admin: 'Admin',
  member: null,
};

interface GroupRowProps {
  group: CommunityGroup;
  onPress: () => void;
  onJoin?: () => void;
  joining?: boolean;
}

/**
 * Renders a sub-group inside a community hub.
 * Clearly distinguishes groups the viewer has joined (showing unread count, last message, and tap-to-chat)
 * from groups available to join (showing join policy and a join/request CTA when permitted).
 */
export const GroupRow = memo(function GroupRow({ group, onPress, onJoin, joining = false }: GroupRowProps) {
  const isMember = group.membership === 'member';
  const isPending = group.membership === 'pending';
  const unread = isMember && group.unreadCount > 0;
  const roleLabel = group.role ? ROLE_LABEL[group.role] : null;

  const accessibilityLabel = [
    group.name,
    isMember ? 'Joined' : isPending ? 'Request pending' : 'Not joined',
    plural(group.memberCount, 'member'),
    unread ? `${group.unreadCount} unread` : null,
    group.description,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, !isMember && styles.rowUnjoined]}
      pressedOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <GroupAvatar group={group} dimension={size.communityLg} />
      <View style={styles.body}>
        <View style={styles.topLine}>
          <View style={styles.titleCluster}>
            <Text variant={unread ? 'rowTitleUnread' : 'rowTitle'} numberOfLines={1} style={styles.shrink}>
              {group.name}
            </Text>
            {group.isDefault ? (
              <View style={styles.tag}>
                <Text variant="label" color="textSecondary" style={styles.tagText}>
                  General
                </Text>
              </View>
            ) : null}
            {roleLabel ? (
              <View style={[styles.tag, styles.roleTag]}>
                <Text variant="label" color="primary" style={styles.tagText}>
                  {roleLabel}
                </Text>
              </View>
            ) : null}
            {group.isMuted && isMember ? <BellOff size={13} color={colors.textTertiary} strokeWidth={2} /> : null}
          </View>
          {isMember && group.lastMessage ? (
            <Text variant="meta" color={unread && !group.isMuted ? 'primary' : 'textTertiary'}>
              {formatInboxTime(group.lastMessage.sentAt)}
            </Text>
          ) : (
            <Text variant="meta" color="textTertiary">
              {plural(group.memberCount, 'member')}
            </Text>
          )}
        </View>

        <View style={styles.bottomLine}>
          {isMember ? (
            <Text variant="preview" color={unread ? 'text' : 'textTertiary'} numberOfLines={1} style={styles.shrink}>
              {group.lastMessage
                ? `${group.lastMessage.senderName}: ${group.lastMessage.kind === 'photo' ? 'Sent a photo' : group.lastMessage.text}`
                : group.description || `${plural(group.memberCount, 'member')} · No messages yet`}
            </Text>
          ) : (
            <Text variant="preview" color="textSecondary" numberOfLines={2} style={styles.shrink}>
              {group.description || 'No description provided.'}
            </Text>
          )}

          {isMember ? (
            <View style={styles.trailing}>
              <CountBadge count={group.unreadCount} muted={group.isMuted} />
              <ChevronRight size={16} color={colors.textTertiary} strokeWidth={1.75} />
            </View>
          ) : isPending ? (
            <View style={styles.pendingPill}>
              <Text variant="label" color="textSecondary">
                Requested
              </Text>
            </View>
          ) : group.permissions.canJoin && onJoin ? (
            <Button
              label={group.joinPolicy === 'approval' ? 'Request' : 'Join'}
              variant="join"
              size="small"
              loading={joining}
              onPress={onJoin}
            />
          ) : (
            <View style={styles.lockedPill}>
              <Lock size={12} color={colors.textTertiary} strokeWidth={2} />
              <Text variant="label" color="textTertiary">
                Invite only
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: gutter,
    paddingVertical: space[3],
    minHeight: 72,
    backgroundColor: colors.surface,
  },
  rowUnjoined: {
    backgroundColor: colors.surface,
  },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  titleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  shrink: {
    flexShrink: 1,
    minWidth: 0,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[2],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
  },
  tag: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.tag,
  },
  roleTag: {
    backgroundColor: colors.primarySubtle,
  },
  tagText: {
    fontSize: 11,
  },
  pendingPill: {
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space[2],
    paddingVertical: 4,
  },
});
