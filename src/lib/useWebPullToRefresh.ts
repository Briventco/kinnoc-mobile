import { useRef, useState } from 'react';
import { Animated, Platform, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** How far the indicator follows the finger, and how far a pull must go to refresh. */
export const PULL_MAX = 96;
export const PULL_TRIGGER = 64;
/** The finger travels this much further than the indicator, for a firm, deliberate pull. */
const RESISTANCE = 0.5;

const touchY = (e: GestureResponderEvent) => {
  const n = e.nativeEvent as unknown as { touches?: { pageY: number }[]; pageY?: number };
  return n.touches?.[0]?.pageY ?? n.pageY ?? 0;
};

/**
 * Pull-to-refresh for touch browsers, where React Native Web has no RefreshControl. Spread
 * `handlers` on the scroll view and draw an indicator from `pull` (0 to PULL_MAX). A pull counts
 * only when it starts with the list at the very top, so ordinary scrolling never triggers it.
 * On iOS and Android it returns nothing: the native RefreshControl does the job there.
 */
export function useWebPullToRefresh(onRefresh: () => void, disabled = false) {
  const [pull] = useState(() => new Animated.Value(0));
  const gesture = useRef({ atTop: true, startY: null as number | null, distance: 0 });

  if (Platform.OS !== 'web') return null;

  const settle = () => {
    gesture.current.startY = null;
    gesture.current.distance = 0;
    Animated.timing(pull, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const handlers = {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      gesture.current.atTop = e.nativeEvent.contentOffset.y <= 0;
    },
    scrollEventThrottle: 50,
    onTouchStart: (e: GestureResponderEvent) => {
      gesture.current.startY = gesture.current.atTop && !disabled ? touchY(e) : null;
    },
    onTouchMove: (e: GestureResponderEvent) => {
      const { startY } = gesture.current;
      if (startY === null) return;
      const distance = Math.min(PULL_MAX, Math.max(0, (touchY(e) - startY) * RESISTANCE));
      gesture.current.distance = distance;
      pull.setValue(distance);
    },
    onTouchEnd: () => {
      if (gesture.current.startY === null) return;
      const pulledEnough = gesture.current.distance >= PULL_TRIGGER;
      settle();
      if (pulledEnough) onRefresh();
    },
    onTouchCancel: settle,
  };

  return { handlers, pull };
}
