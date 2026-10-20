import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, type ColorName, type TypeVariant, type as typeStyles } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: ColorName;
}

/** All app text. Picks a design-system style and colour; respects the system text size. */
export function Text({ variant = 'message', color = 'text', style, maxFontSizeMultiplier = 1.8, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[typeStyles[variant], { color: colors[color] }, style]}
      {...rest}
    />
  );
}
