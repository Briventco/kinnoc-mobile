import { router } from 'expo-router';
import { History } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { ScreenHeader } from '@/components/Header';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { SettingRow } from '@/features/settings/SettingRow';
import { CategoryCard } from '@/features/feedback/FeedbackParts';
import { useMyFeedback } from '@/features/feedback/hooks';
import { FEEDBACK_CATEGORIES } from '@/features/feedback/model';
import { flatten } from '@/lib/cache';
import { colors, gutter, space } from '@/theme';

/** Feedback and suggestions: pick what the feedback is about, or follow what you've sent. */
export default function FeedbackHome() {
  const mine = useMyFeedback();
  // A backend without the feedback routes: say so up front instead of failing after typing.
  const unavailable = mine.error instanceof ApiError && mine.error.code === 'unsupported';
  const items = flatten(mine.data);
  const replies = items.reduce((n, f) => n + f.responseCount, 0);
  const summary = mine.isPending
    ? undefined
    : mine.isError
      ? undefined
      : items.length === 0
        ? 'Nothing sent yet'
        : [`${items.length}${mine.hasNextPage ? '+' : ''} sent`, replies ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : null].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Feedback" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text variant="pageTitle" accessibilityRole="header">
            We&apos;d love to hear from you.
          </Text>
          <Text variant="post" color="textSecondary">
            Your feedback helps us make Kinnoc better. Tell us what&apos;s working, what isn&apos;t, or what you&apos;d love to see.
          </Text>
        </View>

        {unavailable ? (
          <Banner tone="info" message="Sending feedback from the app isn't available yet. Check back after the next update." style={styles.banner} />
        ) : null}

        <Text variant="label" color="textTertiary" style={styles.sectionTitle} accessibilityRole="header">
          What&apos;s it about?
        </Text>
        <View style={styles.cards}>
          {FEEDBACK_CATEGORIES.map((category) => (
            <CategoryCard
              key={category}
              category={category}
              disabled={unavailable}
              onPress={() => router.push({ pathname: '/feedback/new', params: { category } })}
            />
          ))}
        </View>

        <Text variant="label" color="textTertiary" style={styles.sectionTitle} accessibilityRole="header">
          Your feedback
        </Text>
        <SettingRow icon={History} label="Your submissions" detail={summary} onPress={() => router.push('/feedback/history')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: space[8] },
  intro: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[2] },
  banner: { marginHorizontal: gutter, marginTop: space[4] },
  sectionTitle: { paddingHorizontal: gutter, paddingTop: space[6], paddingBottom: space[2] },
  cards: { paddingHorizontal: gutter, gap: space[3] },
});
