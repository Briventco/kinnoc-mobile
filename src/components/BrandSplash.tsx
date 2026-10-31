import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter } from '@/theme';

import { Text } from './Text';

/**
 * Shown while fonts and the session restore. The mark matches the native splash
 * (same image, same 76pt box) so the hand-over is seamless; "from Brivent" sits at the foot.
 */
export function BrandSplash({ onLayout, children }: { onLayout?: () => void; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root} onLayout={onLayout} accessibilityLabel="Kinnoc is loading">
      <Image source={require('@/assets/images/splash-icon.png')} style={styles.mark} contentFit="contain" />
      {/* A note under the mark, e.g. when the account check is slow; the mark never moves. */}
      {children ? <View style={[styles.note, { bottom: insets.bottom + 72 }]}>{children}</View> : null}
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
  note: { position: 'absolute', left: gutter, right: gutter },
});
