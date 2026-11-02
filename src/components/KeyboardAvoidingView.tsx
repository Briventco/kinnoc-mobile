import type { ComponentProps } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { KEYBOARD_BEHAVIOR, useKeyboardHeight } from '@/lib/useKeyboardVisible';

type Props = ComponentProps<typeof RNKeyboardAvoidingView>;

/**
 * Cross-platform KeyboardAvoidingView that works on native (iOS/Android) and Web.
 * On Web, react-native-web's built-in KeyboardAvoidingView is a no-op; this component
 * measures the virtual keyboard via the Visual Viewport API and adds dynamic paddingBottom,
 * preventing inputs from getting hidden behind mobile keyboards on iPhone Safari.
 */
export function KeyboardAvoidingView({ style, behavior = KEYBOARD_BEHAVIOR, children, ...rest }: Props) {
  const keyboardHeight = useKeyboardHeight();

  const webStyle: StyleProp<ViewStyle> =
    Platform.OS === 'web' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : undefined;

  return (
    <RNKeyboardAvoidingView
      style={[style, webStyle]}
      behavior={Platform.OS === 'web' ? undefined : behavior}
      {...rest}
    >
      {children}
    </RNKeyboardAvoidingView>
  );
}

