import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';

import { colors, radius } from '@/theme';

import { Pressable } from './Pressable';
import { Text } from './Text';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** `radio` for one-of-many choices in forms; `button` for filters. */
  role?: 'radio' | 'button';
  style?: StyleProp<ViewStyle>;
}

/** A pill for filters and single choices: mist when idle, ink when selected. */
export function Chip({ label, selected, onPress, disabled, role = 'button', style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ selected, checked: role === 'radio' ? selected : undefined, disabled }}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled, style]}
      pressedOpacity={0.75}
      hitSlop={4}
    >
      <Text variant="button" color={selected ? 'onPrimary' : 'text'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.text },
  disabled: { opacity: 0.45 },
});
