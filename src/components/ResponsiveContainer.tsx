import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { colors } from '@/theme';

export const DESKTOP_MAX_WIDTH = 480;

interface ResponsiveContainerProps {
  children: ReactNode;
}

/**
 * Responsive viewport container for web desktop and mobile browsers.
 * - On mobile (native): pass-through without wrapping views.
 * - On mobile web (<= 480px): dynamically matches visualViewport height so keyboard appearance
 *   does not scroll the window or obscure headers.
 * - On desktop web (> 480px): keeps the application within a centered, phone-width container
 *   against a subtle Kinnoc mist background (surface2), with clean hairlines and no horizontal overflow.
 */
export function ResponsiveContainer({ children }: ResponsiveContainerProps) {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > DESKTOP_MAX_WIDTH;

  if (Platform.OS !== 'web') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.viewport, { height }, isDesktop && styles.viewportDesktop]}>
      <View style={[styles.column, { height }, isDesktop && styles.columnDesktop]}>
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
    overflow: 'hidden',
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
    overflow: 'hidden',
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

