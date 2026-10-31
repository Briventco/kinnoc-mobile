import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { CommunitySummary } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { colors, gutter, radius, space } from '@/theme';

/** Shared by your profile and other people's, so both read the same. */

export function InterestTags({ interests }: { interests: string[] }) {
  return (
    <View style={styles.tags}>
      {interests.map((i) => (
        <View key={i} style={styles.tag}>
          <Text variant="name" style={styles.tagText}>
            {i}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Community squares in a sideways strip; each opens the community. */
export function CommunityStrip({ communities }: { communities: CommunitySummary[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripOuter}>
      {communities.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })}
          style={styles.stripItem}
          accessibilityRole="button"
          accessibilityLabel={c.name}
        >
          <CommunityAvatar id={c.id} monogram={c.monogram} uri={c.photoUrl} size={56} />
          <Text variant="meta" numberOfLines={2} style={styles.stripLabel}>
            {c.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tag: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.tag, paddingHorizontal: 12, paddingVertical: 7 },
  tagText: { fontSize: 14 },
  stripOuter: { marginHorizontal: -gutter },
  strip: { paddingHorizontal: gutter, gap: space[4], paddingBottom: space[5] },
  stripItem: { width: 72, alignItems: 'center', gap: 6 },
  stripLabel: { textAlign: 'center' },
});
