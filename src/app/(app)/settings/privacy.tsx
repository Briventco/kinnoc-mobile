import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/Header';
import { Text } from '@/components/Text';
import { colors, gutter, space } from '@/theme';

const POINTS = [
  {
    title: 'Community conversations',
    body: 'Only members can read a community’s conversation. Private communities approve new members before they can see anything.',
  },
  {
    title: 'Your profile',
    body: 'Your name, username, bio and interests are visible to people on Kinnoc. Edit them any time from your profile.',
  },
  {
    title: 'On this phone',
    body: 'Your sign-in is kept in the device’s secure storage and removed when you sign out.',
  },
];

/** Explains current privacy behaviour. Controls (blocking, reporting, visibility) come with the backend. */
export default function Privacy() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Privacy and safety" />
      <ScrollView contentContainerStyle={styles.content}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <Text variant="section">{p.title}</Text>
            <Text variant="post" color="textSecondary">
              {p.body}
            </Text>
          </View>
        ))}
        <Text variant="meta" color="textTertiary">
          Blocking, reporting and profile visibility settings are not available in this version yet.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: gutter, gap: space[6], paddingBottom: space[8] },
  point: { gap: space[2] },
});
