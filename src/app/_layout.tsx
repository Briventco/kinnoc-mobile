import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { BrandSplash } from '@/components/BrandSplash';
import { Text } from '@/components/Text';
import { ToastProvider } from '@/components/Toast';
import { env } from '@/config/env';
import { OnboardingProvider, useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { queryClient } from '@/lib/query';
import { colors, fontAssets, gutter, space } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // If fonts fail to load the app continues with the system font rather than blocking.
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OnboardingProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <RootNavigator fontsReady={fontsReady} />
            </ToastProvider>
          </OnboardingProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useAuth();
  const { completed } = useOnboarding();
  const [splashHidden, setSplashHidden] = useState(false);
  const ready = fontsReady && status !== 'restoring' && completed !== null;

  const hideNativeSplash = useCallback(() => {
    if (splashHidden) return;
    setSplashHidden(true);
    void SplashScreen.hideAsync();
  }, [splashHidden]);

  // Never leave the native splash up if layout is slow.
  useEffect(() => {
    const t = setTimeout(hideNativeSplash, 3000);
    return () => clearTimeout(t);
  }, [hideNativeSplash]);

  if (env.configProblems.length) return <ConfigProblems onLayout={hideNativeSplash} />;
  if (!ready) return <BrandSplash onLayout={hideNativeSplash} />;

  const signedIn = status === 'signedIn';
  // Where a denied route sends the user, given the current state.
  const home = signedIn ? '/' : completed ? '/welcome' : '/onboarding';

  return (
    <View style={styles.flex} onLayout={hideNativeSplash}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
        <Stack.Protected guard={signedIn} redirectTo={home}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn && !completed} redirectTo={home}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn && !!completed} redirectTo={home}>
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

/** Shown instead of the app when a release build is missing required configuration. */
function ConfigProblems({ onLayout }: { onLayout: () => void }) {
  return (
    <SafeAreaView style={styles.flex} onLayout={onLayout}>
      <ScrollView contentContainerStyle={styles.config}>
        <Text variant="pageTitle">Kinnoc isn&apos;t configured</Text>
        <Text variant="post" color="textSecondary">
          This build is missing settings it needs to run. Nothing has been sent or stored.
        </Text>
        {env.configProblems.map((p) => (
          <Text key={p} variant="message" color="warning">
            {p}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  config: { padding: gutter, gap: space[3] },
});
