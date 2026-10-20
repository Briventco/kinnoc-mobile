import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Bell, Bookmark, Code, LogOut, Shield, UserPen } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { ScreenHeader } from '@/components/Header';
import { ConfirmDialog } from '@/components/Overlays';
import { Text } from '@/components/Text';
import { env } from '@/config/env';
import { SettingRow, SettingSection } from '@/features/settings/SettingRow';
import { colors, gutter, space } from '@/theme';

export default function Settings() {
  const { session, signOut, isPreview } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingSection title="Account">
          <SettingRow icon={UserPen} label="Edit profile" onPress={() => router.push('/settings/edit-profile')} />
          <SettingRow icon={Bookmark} label="Saved" onPress={() => router.push('/saved')} />
          {session ? <SettingRow label="Email" detail={session.user.email} /> : null}
        </SettingSection>
        <SettingSection title="Notifications">
          <SettingRow icon={Bell} label="Notification settings" onPress={() => router.push('/settings/notifications')} />
        </SettingSection>
        <SettingSection title="Privacy">
          <SettingRow icon={Shield} label="Privacy and safety" onPress={() => router.push('/settings/privacy')} />
        </SettingSection>
        {env.usesSampleData || isPreview ? (
          <SettingSection title="Development">
            <SettingRow
              icon={Code}
              label="Build mode"
              detail={[env.usesSampleData ? 'Sample data (no backend)' : `API: ${env.apiUrl}`, isPreview ? 'Preview sign-in (not real authentication)' : 'Supabase sign-in'].join(' · ')}
            />
          </SettingSection>
        ) : null}
        <SettingSection title="Session">
          <SettingRow icon={LogOut} label="Sign out" warning onPress={() => setConfirm(true)} />
        </SettingSection>
        <Text variant="meta" color="textTertiary" style={styles.version}>
          Kinnoc {Constants.expoConfig?.version ?? ''} · from Brivent
        </Text>
      </ScrollView>
      <ConfirmDialog
        visible={confirm}
        title="Sign out of Kinnoc?"
        body="You'll need your email and password to sign back in. Your data on this device is cleared."
        confirmLabel="Sign out"
        loading={signingOut}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: space[8] },
  version: { paddingHorizontal: gutter, paddingTop: space[6], textAlign: 'center' },
});
