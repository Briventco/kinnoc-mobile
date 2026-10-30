import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NotificationPreferences } from '@/api/types';
import { ScreenHeader } from '@/components/Header';
import { Banner, CenteredSpinner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/hooks';
import { SettingSection, ToggleRow } from '@/features/settings/SettingRow';
import { api } from '@/services';
import { colors, gutter, space } from '@/theme';

const ROWS: { key: keyof NotificationPreferences; label: string; detail: string }[] = [
  { key: 'mentions', label: 'Mentions', detail: 'When someone @mentions you' },
  { key: 'replies', label: 'Replies', detail: 'Replies to your posts and comments' },
  { key: 'likes', label: 'Likes and reactions', detail: 'When people like your posts' },
  { key: 'communityActivity', label: 'Community activity', detail: 'New members and updates in your communities' },
  { key: 'reminders', label: 'Reminders', detail: 'Events you saved and deadlines closing soon' },
];

export default function NotificationSettings() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const toast = useToast();

  if (!api.capabilities.social) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScreenHeader title="Notification settings" />
        <View style={styles.push}>
          <Banner tone="info" message="Notifications and notification settings are not available on this version of the backend yet." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Notification settings" />
      {prefs.isPending ? (
        <CenteredSpinner />
      ) : prefs.isError ? (
        <ErrorState error={prefs.error} onRetry={() => prefs.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <SettingSection title="In the app">
            {ROWS.map((r) => (
              <ToggleRow
                key={r.key}
                label={r.label}
                detail={r.detail}
                value={prefs.data[r.key]}
                onChange={(value) =>
                  update.mutate({ ...prefs.data, [r.key]: value }, { onError: () => toast.show({ message: "Couldn't save. Try again.", aboveNav: false }) })
                }
              />
            ))}
          </SettingSection>
          <View style={styles.push}>
            <Text variant="label" color="textTertiary">
              On this phone
            </Text>
            {/* Push needs device registration, credentials and server delivery; none are in place yet. */}
            <Banner tone="offline" message="Push notifications aren't available in this version yet. You'll still see everything in Notifications." />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: space[8] },
  push: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
});
