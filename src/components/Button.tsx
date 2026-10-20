import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, type ColorName } from '@/theme';

import { Pressable } from './Pressable';
import { Text } from './Text';

type Variant = 'primary' | 'quiet' | 'join' | 'joined' | 'text' | 'warning';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  /** 52px for screen-level actions, 44px elsewhere, 34px for Join. */
  size?: 'large' | 'medium' | 'small';
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  /** Text buttons: ink-2 instead of blue, e.g. "See all". */
  subdued?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const look: Record<Variant, { bg?: string; fg: ColorName }> = {
  primary: { bg: colors.primary, fg: 'onPrimary' },
  quiet: { bg: colors.surface2, fg: 'text' },
  join: { bg: colors.primarySubtle, fg: 'primary' },
  joined: { bg: colors.surface, fg: 'textTertiary' },
  text: { fg: 'primary' },
  warning: { bg: colors.surface2, fg: 'warning' },
};

/**
 * One action each. Only the single most important action on a screen is primary.
 * No outlined buttons, no full pills, never red.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading,
  disabled,
  icon: Icon,
  subdued,
  fullWidth,
  accessibilityHint,
  style,
}: ButtonProps) {
  const l = look[variant];
  const fg: ColorName = variant === 'text' && subdued ? 'textSecondary' : l.fg;
  const height = variant === 'text' ? 44 : size === 'large' ? 52 : size === 'small' ? 34 : 44;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      hitSlop={size === 'small' ? 5 : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: variant === 'primary' && pressed ? colors.primaryPressed : l.bg,
          borderRadius: size === 'large' || variant === 'primary' ? radius.md : radius.field,
          paddingHorizontal: variant === 'text' ? 0 : size === 'small' ? 14 : 18,
        },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} />
      ) : (
        <View style={styles.row}>
          <Text variant={size === 'large' ? 'buttonLarge' : 'button'} color={fg} numberOfLines={1}>
            {label}
          </Text>
          {Icon ? <Icon size={16} color={colors[fg]} strokeWidth={2} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
});
