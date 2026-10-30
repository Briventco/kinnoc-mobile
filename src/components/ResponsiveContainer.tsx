import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '@/theme';

export const DESKTOP_MAX_WIDTH = 480;

interface ResponsiveContainerProps {
  children: ReactNode;
}

/**
 * Responsive viewport container for web desktop.
 * - On mobile (native or small web screens <= 480px): full screen with native/fluid sizing.
 * - On desktop web (> 480px): keeps the application within a centered, phone-width container
 *   against a subtle Kinnoc mist background (surface2), with clean hairlines and no horizontal overflow.
 */
export function ResponsiveContainer({ children }: ResponsiveContainerProps) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > DESKTOP_MAX_WIDTH;

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.viewport, isDesktop && styles.viewportDesktop]}>
      <View style={[styles.column, isDesktop && styles.columnDesktop]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
  viewportDesktop: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
  },
  columnDesktop: {
    maxWidth: DESKTOP_MAX_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderRightWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
});

