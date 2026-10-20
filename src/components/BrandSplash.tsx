import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

import { Text } from './Text';

/**
 * Shown while fonts and the session restore. The mark matches the native splash
 * (same image, same 76pt box) so the hand-over is seamless; "from Brivent" sits at the foot.
 */
export function BrandSplash({ onLayout }: { onLayout?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} onLayout={onLayout} accessibilityLabel="Kinnoc is loading">
      <Image source={require('@/assets/images/splash-icon.png')} style={styles.mark} contentFit="contain" />
      <Text style={[styles.footer, { bottom: insets.bottom + 28 }]} color="textTertiary" variant="tab">
        from <Text variant="tabActive">Brivent</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 76, height: 76 },
  footer: { position: 'absolute' },
});
