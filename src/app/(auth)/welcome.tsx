import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { colors, space, type } from '@/theme';

/** Welcome: the promise, a glimpse of communities, and the two ways in. */
export default function Welcome() {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image
          source={require('@/assets/images/brand/kinnoc-symbol-blue.png')}
          style={styles.mark}
          contentFit="contain"
          accessibilityLabel="Kinnoc"
        />
        <View style={styles.spacer} />
        <Text style={styles.hero} accessibilityRole="header">
          Find your people.{'\n'}Join the conversation.{'\n'}
          <Text style={[styles.hero, styles.heroBlue]}>Discover what&apos;s next.</Text>
        </Text>
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[
            { id: 'c_tech', m: 'TC' },
            { id: 'c_uniosun', m: 'U' },
            { id: 'c_career', m: 'CG' },
            { id: 'c_design', m: 'DH' },
          ].map((c, i) => (
            <CommunityAvatar key={c.id} id={c.id} monogram={c.m} size={52} style={[styles.stacked, { marginLeft: i ? -10 : 0 }]} />
          ))}
        </View>
        <Text variant="post" color="textSecondary">
          Communities, conversations and opportunities for students, creators and young professionals.
        </Text>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Create account" size="large" onPress={() => router.push('/sign-up')} />
        <Button label="I already have an account" variant="quiet" size="large" onPress={() => router.push('/sign-in')} />
        {/* TODO(legal): link Terms and Privacy Policy once their URLs are published. */}
        <Text variant="meta" color="textTertiary" style={styles.legal}>
          By continuing you agree to the <Text variant="meta">Terms</Text> and <Text variant="meta">Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, paddingHorizontal: space[6], paddingTop: space[8], gap: space[5] },
  mark: { width: 34, height: 44 },
  spacer: { flex: 1, minHeight: space[8] },
  hero: { ...type.hero, color: colors.text },
  heroBlue: { color: colors.primary },
  stack: { flexDirection: 'row' },
  stacked: { borderWidth: 3, borderColor: colors.surface },
  actions: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[3], gap: space[3] },
  legal: { textAlign: 'center' },
});
