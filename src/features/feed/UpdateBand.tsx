import { router } from 'expo-router';
import { ArrowRight, Calendar, MapPin } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { CommunityUpdate } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { formatAge, formatDayTime } from '@/lib/format';
import { colors, gutter, space } from '@/theme';

/** A community update: a full-bleed mist band with a Bricolage headline, date and place. */
export function UpdateBand({ update }: { update: CommunityUpdate }) {
  const { community } = update;
  return (
    <View style={styles.band}>
      <View style={styles.source}>
        <CommunityAvatar id={community.id} monogram={community.monogram} uri={community.photoUrl} size={24} />
        <Text variant="meta" color="textTertiary" numberOfLines={1} style={styles.flex}>
          <Text variant="name" style={styles.communityName}>
            {community.name}
          </Text>
          {' · Update · '}
          {formatAge(update.createdAt)}
        </Text>
      </View>
      <Text variant="headline" accessibilityRole="header">
        {update.title}
      </Text>
      {update.startsAt ? (
        <View style={styles.line}>
          <Calendar size={16} color={colors.textTertiary} strokeWidth={1.75} />
          <Text variant="preview" color="textSecondary">
            {formatDayTime(update.startsAt)}
          </Text>
        </View>
      ) : null}
      {update.place ? (
        <View style={styles.line}>
          <MapPin size={16} color={colors.textTertiary} strokeWidth={1.75} />
          <Text variant="preview" color="textSecondary" style={styles.flex}>
            {update.place}
          </Text>
        </View>
      ) : null}
      <Text variant="message">{update.body}</Text>
      <Button
        variant="text"
        label="Open community"
        icon={ArrowRight}
        onPress={() => router.push({ pathname: '/community/[id]', params: { id: community.id } })}
        style={styles.link}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: colors.surface2, paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[1], gap: space[2] },
  source: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  communityName: { fontSize: 14 },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  link: { alignSelf: 'flex-start' },
});
