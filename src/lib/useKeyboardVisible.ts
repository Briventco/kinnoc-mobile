import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { space } from '@/theme';

/**
 * `KeyboardAvoidingView` behaviour for every screen with a text field. Android draws edge to
 * edge (always on since SDK 54), which stops `adjustResize` from shrinking the window, so Android
 * needs padding too; without it the keyboard covers the field. Use one avoiding view per screen,
 * never nested ones, or the offsets add up.
 */
export const KEYBOARD_BEHAVIOR = 'padding' as const;

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Bottom padding for a bar pinned to the bottom of the screen (a composer or toolbar). It clears
 * the home indicator or navigation bar, but while the keyboard is open those sit under the
 * keyboard, so it shrinks to a small gap and the bar rests right on the keyboard.
 */
export function useBottomBarInset(safeAreaBottom: number) {
  const keyboard = useKeyboardVisible();
  return keyboard ? space[2] : Math.max(safeAreaBottom, space[2]);
}
