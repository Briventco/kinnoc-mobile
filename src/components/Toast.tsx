import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, radius, shadow, size } from '@/theme';

import { Pressable } from './Pressable';
import { Text } from './Text';

interface ToastOptions {
  message: string;
  action?: { label: string; onPress: () => void };
  /** Extra bottom offset when the bottom nav is visible. Defaults to true. */
  aboveNav?: boolean;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

/** Confirms what just happened. One at a time, four seconds, one optional action. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ ...options, id: Date.now() });
      AccessibilityInfo.announceForAccessibility(options.message);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, 4000);
    },
    [hide, opacity],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const bottom = insets.bottom + 16 + (toast?.aboveNav === false ? 0 : size.navHeight);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="box-none" style={[styles.host, { bottom, opacity }]}>
          <View style={styles.toast}>
            <Text variant="preview" color="onPrimary" style={styles.message}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                onPress={() => {
                  toast.action?.onPress();
                  hide();
                }}
                accessibilityRole="button"
                hitSlop={10}
              >
                <Text variant="button" style={styles.action}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(() => ({ show }), [show]);
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: gutter, right: gutter },
  toast: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.toast,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...shadow.toast,
  },
  message: { flex: 1 },
  action: { color: colors.toastAction },
});
