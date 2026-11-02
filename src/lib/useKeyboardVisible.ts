import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { space } from '@/theme';

/**
 * `KeyboardAvoidingView` behaviour for every screen with a text field. Android draws edge to
 * edge (always on since SDK 54), which stops `adjustResize` from shrinking the window, so Android
 * needs padding too; without it the keyboard covers the field. On Web, standard react-native-web
 * KeyboardAvoidingView is a no-op; we handle web padding dynamically using useKeyboardHeight.
 */
export const KEYBOARD_BEHAVIOR =
  Platform.OS === 'ios' ? ('padding' as const) : Platform.OS === 'android' ? ('padding' as const) : undefined;

/**
 * Returns the active keyboard height in pixels across both native platforms and mobile web.
 * On mobile web (iOS Safari, Android Chrome), uses window.visualViewport to detect the exact
 * height occupied by the virtual keyboard so the input bar can be positioned directly above it.
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const show = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (e) => setKeyboardHeight(e.endCoordinates.height),
      );
      const hide = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
        () => setKeyboardHeight(0),
      );
      return () => {
        show.remove();
        hide.remove();
      };
    }

    if (typeof window === 'undefined') return;

    const measureWebKeyboard = () => {
      if (!window.visualViewport) {
        setKeyboardHeight(0);
        return;
      }
      const vv = window.visualViewport;
      // On mobile browsers, visualViewport shrinks when virtual keyboard is open.
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      // Only treat significant diffs (> 80px) as keyboard to avoid false positives on URL bar resizing
      setKeyboardHeight(diff > 80 ? Math.round(diff) : 0);
    };

    const resetScroll = () => {
      if (typeof window !== 'undefined' && (window.scrollY !== 0 || window.scrollX !== 0)) {
        window.scrollTo(0, 0);
      }
    };

    const handleFocusIn = () => {
      measureWebKeyboard();
      resetScroll();
      requestAnimationFrame(resetScroll);
    };

    measureWebKeyboard();

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', () => {
      setTimeout(measureWebKeyboard, 50);
    });
    window.addEventListener('scroll', resetScroll, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measureWebKeyboard);
      window.visualViewport.addEventListener('scroll', measureWebKeyboard);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', measureWebKeyboard);
      window.removeEventListener('scroll', resetScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', measureWebKeyboard);
        window.visualViewport.removeEventListener('scroll', measureWebKeyboard);
      }
    };
  }, []);

  return keyboardHeight;
}

export function useKeyboardVisible() {
  const height = useKeyboardHeight();
  return height > 0;
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
