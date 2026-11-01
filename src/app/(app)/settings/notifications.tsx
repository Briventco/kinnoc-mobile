import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { NotificationPreferences } from '@/api/types';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { Banner, CenteredSpinner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/hooks';
import { useWebPushStatus } from '@/features/notifications/webPush';
import { SettingSection, ToggleRow } from '@/features/settings/SettingRow';
import { api } from '@/services';
import { colors, gutter, space } from '@/theme';

const IN_APP_ROWS: { key: keyof NotificationPreferences; label: string; detail: string }[] = [
  { key: 'mentions', label: 'Mentions', detail: 'When someone @mentions you' },
  { key: 'replies', label: 'Replies', detail: 'Replies to your posts and comments' },
  { key: 'likes', label: 'Likes and reactions', detail: 'When people like your posts' },
  { key: 'directMessages', label: 'Direct & chat messages', detail: 'Messages in your active communities' },
  { key: 'communityActivity', label: 'Community invitations', detail: 'Invitations and requests to join communities' },
  { key: 'verifications', label: 'Verification updates', detail: 'Badge status approvals and updates' },
  { key: 'reminders', label: 'Announcements & system', detail: 'Community announcements and system alerts' },
];

const PUSH_ROWS: { key: keyof NotificationPreferences; label: string; detail: string }[] = [
  { key: 'pushDirectMessages', label: 'Chat messages', detail: 'Direct messages and community replies' },
  { key: 'pushLikes', label: 'Likes', detail: 'When someone likes your post' },
  { key: 'pushComments', label: 'Comments and replies', detail: 'New comments and responses' },
  { key: 'pushMentions', label: 'Mentions', detail: 'When you are @mentioned' },
  { key: 'pushInvitations', label: 'Community invitations', detail: 'Invites to join new communities' },
  { key: 'pushVerifications', label: 'Verification badge', detail: 'Badge approval and verification news' },
];

export default function NotificationSettings() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const webPush = useWebPushStatus();
  const toast = useToast();

  const isEnabled = api.capabilities.notifications ?? api.capabilities.social;

  if (!isEnabled) {
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
            {IN_APP_ROWS.map((r) => (
              <ToggleRow
                key={r.key}
                label={r.label}
                detail={r.detail}
                value={Boolean(prefs.data[r.key] ?? true)}
                onChange={(value) =>
                  update.mutate(
                    { ...prefs.data, [r.key]: value },
                    { onError: () => toast.show({ message: "Couldn't save. Try again.", aboveNav: false }) },
                  )
                }
              />
            ))}
          </SettingSection>

          <SettingSection title="Web Push notifications">
            {!webPush.supported ? (
              <View style={styles.sectionPadding}>
                <Banner
                  tone="info"
                  message="Web Push is not supported on this browser or platform. You will still receive in-app notifications."
                />
              </View>
            ) : webPush.permission === 'denied' ? (
              <View style={styles.sectionPadding}>
                <Banner
                  tone="warning"
                  message="Notifications are blocked in your browser settings. To enable push notifications, allow notifications for Kinnoc in your browser site settings."
                />
              </View>
            ) : (
              <>
                <ToggleRow
                  label="Push notifications"
                  detail={
                    webPush.isSubscribed
                      ? 'Subscribed — you receive notifications when the web app is closed'
                      : 'Receive notifications even when the web application is closed'
                  }
                  value={webPush.isSubscribed}
                  disabled={webPush.loading}
                  onChange={async () => {
                    await webPush.toggle();
                    if (!webPush.isSubscribed) {
                      toast.show({ message: 'Push notifications enabled', aboveNav: false });
                    } else {
                      toast.show({ message: 'Push notifications disabled', aboveNav: false });
                    }
                  }}
                />

                {webPush.isSubscribed ? (
                  <>
                    <View style={styles.subHeader}>
                      <Text variant="preview" color="textSecondary">
                        Choose what sends push notifications:
                      </Text>
                    </View>
                    {PUSH_ROWS.map((r) => (
                      <ToggleRow
                        key={r.key}
                        label={r.label}
                        detail={r.detail}
                        value={Boolean(prefs.data[r.key] ?? true)}
                        onChange={(value) =>
                          update.mutate(
                            { ...prefs.data, [r.key]: value },
                            { onError: () => toast.show({ message: "Couldn't save. Try again.", aboveNav: false }) },
                          )
                        }
                      />
                    ))}
                  </>
                ) : (
                  <View style={styles.buttonContainer}>
                    <Button
                      variant="quiet"
                      label={webPush.loading ? 'Updating...' : 'Enable Web Push'}
                      disabled={webPush.loading}
                      onPress={async () => {
                        await webPush.toggle();
                        toast.show({ message: 'Push notifications enabled', aboveNav: false });
                      }}
                    />
                  </View>
                )}
              </>
            )}
          </SettingSection>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: space[8] },
  push: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  sectionPadding: { paddingHorizontal: gutter, paddingVertical: space[3] },
  subHeader: { paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[1] },
  buttonContainer: { paddingHorizontal: gutter, paddingVertical: space[3] },
});
