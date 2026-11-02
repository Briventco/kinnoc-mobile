import { router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { normalizeDeepLinkTarget } from '@/lib/deepLinks';
import { colors, space } from '@/theme';

export default function NotFound() {
  const pathname = usePathname();

  useEffect(() => {
    let currentPath = pathname;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      currentPath = window.location.pathname + window.location.search;
    }
    const normalized = normalizeDeepLinkTarget(currentPath);
    if (normalized && normalized !== currentPath && normalized !== '/') {
      const timer = setTimeout(() => {
        router.replace(normalized as Href);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Text variant="pageTitle" accessibilityRole="header">
          This page isn&apos;t here
        </Text>
        <Text variant="post" color="textSecondary">
          The link may be old, or the content was removed.
        </Text>
        <Button label="Go to Feed" onPress={() => router.replace('/')} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space[6], gap: space[3] },
  button: { alignSelf: 'flex-start', marginTop: space[2] },
});
