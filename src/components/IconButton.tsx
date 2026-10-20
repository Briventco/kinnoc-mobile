import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, size as sizes, type ColorName } from '@/theme';

import { Pressable } from './Pressable';

interface IconButtonProps {
  icon: LucideIcon;
  /** Required: icon-only buttons always carry an accessible label. */
  label: string;
  onPress?: () => void;
  color?: ColorName;
  size?: number;
  fill?: ColorName;
  disabled?: boolean;
  /** Small marker drawn on the icon, e.g. the new-activity dot. */
  badge?: ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}

/** 44 × 44 hit area, no background. Ink in headers, text-tertiary in rows. */
export function IconButton({ icon: Icon, label, onPress, color = 'text', size = 22, fill, disabled, badge, style, hitSlop }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={hitSlop}
      style={[styles.button, disabled && styles.disabled, style]}
    >
      <View>
        <Icon size={size} color={colors[color]} strokeWidth={1.75} fill={fill ? colors[fill] : 'none'} />
        {badge}
      </View>
    </Pressable>
  );
}

/** The logo-blue "new activity" dot. */
export function NewDot({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  button: {
    width: sizes.touchMin,
    height: sizes.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.brandBlue,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
