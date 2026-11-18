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
  const [keyboardHeight, setKeyboardHeight] = useState(() =>
    Platform.OS !== 'web' && Keyboard.isVisible?.() ? (Keyboard.metrics?.()?.height ?? 0) : 0,
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const subs = [
        Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
          setKeyboardHeight(e.endCoordinates.height),
        ),
        ...(Platform.OS === 'ios'
          ? [
              Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height)),
              Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0)),
            ]
          : []),
        Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0)),
      ];
      return () => {
        subs.forEach((s) => s.remove());
      };
    }

    if (typeof window === 'undefined') return;

    const resetScroll = () => {
      if (typeof window !== 'undefined') {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
        if (document.documentElement && document.documentElement.scrollTop !== 0) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body && document.body.scrollTop !== 0) {
          document.body.scrollTop = 0;
        }
      }
    };

    const isEditableFocused = () => {
      if (typeof document === 'undefined') return false;
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return (el as HTMLElement).isContentEditable === true;
    };

    const measureWebKeyboard = () => {
      if (!window.visualViewport || !isEditableFocused()) {
        setKeyboardHeight(0);
        return;
      }
      const vv = window.visualViewport;
      // On mobile browsers, visualViewport shrinks when virtual keyboard is open.
      // Do NOT subtract vv.offsetTop: WebKit offsets the visual viewport to bring focused
      // inputs into view, which would cancel out the detected keyboard height.
      const rawDiff = window.innerHeight - vv.height;
      // Virtual keyboards are >= 150px; > 120px avoids iOS PWA status-bar / home-indicator insets (~60-95px).
      const isKeyboard = rawDiff > 120;
      setKeyboardHeight(isKeyboard ? Math.round(rawDiff) : 0);
      if (isKeyboard) {
        resetScroll();
      }
    };

    const handleFocusIn = () => {
      measureWebKeyboard();
      resetScroll();
      requestAnimationFrame(resetScroll);
      // On iOS Safari, the visual viewport resize animation can settle 50-300ms after focusin
      setTimeout(measureWebKeyboard, 100);
      setTimeout(measureWebKeyboard, 300);
    };

    const handleFocusOut = () => {
      setTimeout(measureWebKeyboard, 50);
      setTimeout(measureWebKeyboard, 250);
    };

    measureWebKeyboard();

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('scroll', resetScroll, { passive: true });
    window.addEventListener('pageshow', measureWebKeyboard);
    document.addEventListener('visibilitychange', measureWebKeyboard);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', measureWebKeyboard);
      window.visualViewport.addEventListener('scroll', measureWebKeyboard);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('scroll', resetScroll);
      window.removeEventListener('pageshow', measureWebKeyboard);
      document.removeEventListener('visibilitychange', measureWebKeyboard);
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
