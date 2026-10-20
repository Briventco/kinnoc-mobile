import { Pressable as RNPressable, type PressableProps } from 'react-native';

/** Pressable with the shared pressed feedback (a light dim). */
export function Pressable({ style, pressedOpacity = 0.6, ...rest }: PressableProps & { pressedOpacity?: number }) {
  return (
    <RNPressable
      style={(state) => [typeof style === 'function' ? style(state) : style, state.pressed && { opacity: pressedOpacity }]}
      {...rest}
    />
  );
}
