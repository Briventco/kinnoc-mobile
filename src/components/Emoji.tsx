import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';

/** An emoji at a fixed size in the system font, kept separate from adjacent counts and labels. */
export function Emoji({ children, size = 15, style }: { children: string; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <RNText style={[{ fontSize: size, lineHeight: Math.round(size * 1.3) }, style]} maxFontSizeMultiplier={1.3} accessible={false}>
      {children}
    </RNText>
  );
}
