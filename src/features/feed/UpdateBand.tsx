import { router } from 'expo-router';
import { ArrowRight, Calendar, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CommunityUpdate } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { formatDayTime } from '@/lib/format';
import { useRelativeTime } from '@/lib/useRelativeTime';
import { colors } from '@/theme';

/** A community update: styled as a distinct card with an update badge, headline, and details. */
export function UpdateBand({ update }: { update: CommunityUpdate }) {
  const { community } = update;
  const age = useRelativeTime(update.createdAt);
  return (
    <View style={styles.card}>
      <View style={styles.source}>
        <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={36} />
        <View style={styles.flex}>
          <Text variant="name" style={styles.communityName} numberOfLines={1}>
            {community.name}
          </Text>
          <Text variant="meta" color="textTertiary" numberOfLines={1}>
            {age}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text variant="label" style={styles.badgeText}>
            Update
          </Text>
        </View>
      </View>

      <Text variant="headline" accessibilityRole="header" style={styles.title}>
        {update.title}
      </Text>

      {update.startsAt ? (
        <View style={styles.line}>
          <Calendar size={16} color={colors.primary} strokeWidth={2} />
          <Text variant="preview" color="textSecondary">
            {formatDayTime(update.startsAt)}
          </Text>
        </View>
      ) : null}

      {update.place ? (
        <View style={styles.line}>
          <MapPin size={16} color={colors.primary} strokeWidth={2} />
          <Text variant="preview" color="textSecondary" style={styles.flex}>
            {update.place}
          </Text>
        </View>
      ) : null}

      <Text variant="message" color="text">{update.body}</Text>

      <Button
        variant="quiet"
        label="Open community"
        icon={ArrowRight}
        onPress={() => router.push({ pathname: '/community/[id]', params: { id: community.id } })}
        style={styles.link}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  source: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  communityName: { fontSize: 15 },
  badge: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 10,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
  },
  flex: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { alignSelf: 'flex-start', marginTop: 4 },
});
