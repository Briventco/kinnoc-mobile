import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, gutter, size } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

/** Title row for the four main tabs: 24px Bricolage title, actions on the right. */
export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <View style={styles.page}>
      <Text variant="pageTitle" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
        {title}
      </Text>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /** Replaces the title block, e.g. a community identity. */
  center?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  border?: boolean;
}

/** Header for pushed screens: back, 22px title, optional actions. */
export function ScreenHeader({ title, subtitle, center, right, onBack, border = true }: ScreenHeaderProps) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View style={[styles.screen, border && styles.border]}>
      <IconButton icon={ChevronLeft} label="Back" onPress={back} size={26} />
      <View style={styles.flex}>
        {center ?? (
          <>
            {title ? (
              <Text variant="screenTitle" accessibilityRole="header" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="meta" color="textTertiary" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {right ? <View style={styles.actions}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    minHeight: size.headerHeight + 8,
    paddingLeft: gutter,
    paddingRight: gutter - 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  screen: {
    minHeight: size.headerHeight + 8,
    paddingLeft: 4,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
  },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  flex: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
