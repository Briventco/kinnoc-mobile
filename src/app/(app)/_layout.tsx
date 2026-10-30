import { Stack } from 'expo-router';

import { AccountGate } from '@/features/account/AccountGate';
import { colors } from '@/theme';

export const unstable_settings = { anchor: '(tabs)' };

/**
 * Signed-in area, behind the account gate (provisioned account with a profile). Pushed screens
 * (conversations, notifications, Saved…) hide the bottom bar.
 */
export default function AppLayout() {
  return (
    <AccountGate>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings/edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="community/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="stories/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000000' } }} />
      </Stack>
    </AccountGate>
  );
}
