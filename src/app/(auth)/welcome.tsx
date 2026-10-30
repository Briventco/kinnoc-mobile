import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { LegalNotice } from '@/features/auth/LegalNotice';
import { colors, radius, space, type } from '@/theme';

/** Glimpse heights at the default text size, and what sits around the copy (padding, lockup). */
const GLIMPSE_FULL = 196;
const GLIMPSE_COMPACT = 162;
const AROUND_COPY = space[4] + 44 + space[4] * 2;

/** Welcome: the promise, a glimpse of what it looks like inside, and the two ways in. */
export default function Welcome() {
  const { fontScale } = useWindowDimensions();
  // The glimpse appears only where it fits between the copy and the actions, after safe areas,
  // so it never runs under the buttons or forces the promise to scroll.
  const [viewport, setViewport] = useState(0);
  const [copy, setCopy] = useState(0);
  const room = viewport > 0 && copy > 0 ? (viewport - AROUND_COPY - copy - space[4]) / Math.min(fontScale, 1.15) : 0;
  const glimpse = room >= GLIMPSE_FULL ? 'full' : room >= GLIMPSE_COMPACT ? 'compact' : null;
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} bounces={false} onLayout={(e) => setViewport(e.nativeEvent.layout.height)}>
        <Image source={require('@/assets/images/brand/kinnoc-lockup-blue.png')} style={styles.lockup} contentFit="contain" accessibilityLabel="Kinnoc" />
        <View style={styles.middle}>
          <View style={styles.copy} onLayout={(e) => setCopy(e.nativeEvent.layout.height)}>
            <Text style={styles.hero} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              Find your people.{'\n'}Join the conversation.{'\n'}
              <Text style={[styles.hero, styles.heroBlue]} maxFontSizeMultiplier={1.3}>
                Discover what&apos;s next.
              </Text>
            </Text>
            <Text variant="post" color="textSecondary" style={styles.lede}>
              Communities, conversations and opportunities for students, creators and young professionals.
            </Text>
          </View>
          {glimpse ? <Glimpse compact={glimpse === 'compact'} /> : null}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Create account" size="large" onPress={() => router.push('/sign-up')} />
        <Button label="I already have an account" variant="quiet" size="large" onPress={() => router.push('/sign-in')} />
        <LegalNotice />
      </View>
    </SafeAreaView>
  );
}

/**
 * Inside Kinnoc, drawn with the app's own pieces on a Mist band: a moment from a community chat
 * and the event it is about. An illustration, hidden from screen readers; it makes no claims.
 */
function Glimpse({ compact }: { compact: boolean }) {
  const scale = 1.15;
  return (
    <View style={styles.glimpse} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {compact ? null : (
        <View style={styles.chatHead}>
          <CommunityAvatar id="c_tech" monogram="TC" size={24} />
          <Text variant="label" color="textTertiary" maxFontSizeMultiplier={scale}>
            Tech Creators
          </Text>
        </View>
      )}
      <View style={[styles.bubble, styles.incoming]}>
        <Text variant="message" maxFontSizeMultiplier={scale}>
          Who&apos;s going on Saturday?
        </Text>
      </View>
      <View style={[styles.bubble, styles.outgoing]}>
        <Text variant="message" color="onPrimary" maxFontSizeMultiplier={scale}>
          Count me in!
        </Text>
      </View>
      <View style={styles.event}>
        <View style={styles.stamp}>
          <Text variant="label" color="primary" maxFontSizeMultiplier={scale}>
            Oct
          </Text>
          <Text variant="numeral" maxFontSizeMultiplier={scale}>
            24
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="label" color="textTertiary" maxFontSizeMultiplier={scale}>
            Event · Sat, 10:00 AM
          </Text>
          <Text variant="rowTitle" numberOfLines={1} maxFontSizeMultiplier={scale}>
            Lagos Tech Meetup
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  content: { flexGrow: 1, paddingHorizontal: space[6], paddingTop: space[4] },
  lockup: { width: 91, height: 44 },
  middle: { flex: 1, justifyContent: 'center', paddingVertical: space[4], gap: space[4] },
  hero: { ...type.hero, color: colors.text },
  heroBlue: { color: colors.primary },
  copy: { gap: space[4] },
  lede: { maxWidth: 340 },
  glimpse: { backgroundColor: colors.surface2, borderRadius: radius.feature, paddingHorizontal: space[3], paddingVertical: 10, gap: 6 },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: 2 },
  bubble: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.bubble, maxWidth: '85%' },
  incoming: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderTopLeftRadius: radius.tail },
  outgoing: { backgroundColor: colors.bubbleOutgoing, alignSelf: 'flex-end', borderBottomRightRadius: radius.tail },
  event: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[1], paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  stamp: { width: 44, alignItems: 'center' },
  actions: { paddingHorizontal: space[6], paddingTop: space[3], paddingBottom: space[2], gap: space[3] },
});
