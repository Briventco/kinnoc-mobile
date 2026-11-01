import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

import { space } from '@/theme';

/**
 * `KeyboardAvoidingView` behaviour for every screen with a text field. Android draws edge to
 * edge (always on since SDK 54), which stops `adjustResize` from shrinking the window, so Android
 * needs padding too; without it the keyboard covers the field. On Web, avoid artificial padding
 * since browsers (and our responsive container) handle layout viewport sizing directly.
 */
export const KEYBOARD_BEHAVIOR =
  Platform.OS === 'ios' ? ('padding' as const) : Platform.OS === 'android' ? ('padding' as const) : undefined;

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
      const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
      return () => {
        show.remove();
        hide.remove();
      };
    }

    if (typeof window === 'undefined') return;

    const checkWebKeyboard = () => {
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isInputFocused =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      // On mobile browsers, visualViewport shrinks significantly when the virtual keyboard is open.
      const isViewportShrunk =
        window.visualViewport != null && window.innerHeight - window.visualViewport.height > 100;

      setVisible(Boolean(isInputFocused || isViewportShrunk));
    };

    const resetScroll = () => {
      if (typeof window !== 'undefined' && (window.scrollY !== 0 || window.scrollX !== 0)) {
        window.scrollTo(0, 0);
      }
    };

    const handleFocusIn = () => {
      checkWebKeyboard();
      resetScroll();
      requestAnimationFrame(resetScroll);
    };

    checkWebKeyboard();

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', checkWebKeyboard);
    window.addEventListener('scroll', resetScroll, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkWebKeyboard);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', checkWebKeyboard);
      window.removeEventListener('scroll', resetScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', checkWebKeyboard);
      }
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
