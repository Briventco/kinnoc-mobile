import { Platform, StyleSheet } from 'react-native';

import { KeyboardAvoidingView } from '../KeyboardAvoidingView';

let mockKeyboardHeight = 0;
jest.mock('@/lib/useKeyboardVisible', () => ({
  KEYBOARD_BEHAVIOR: 'padding',
  useKeyboardHeight: () => mockKeyboardHeight,
}));

describe('KeyboardAvoidingView', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    mockKeyboardHeight = 0;
  });

  it('renders standard native KeyboardAvoidingView on iOS/Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    mockKeyboardHeight = 300;

    const element = KeyboardAvoidingView({ children: 'Native' });
    const flatStyle = StyleSheet.flatten(element.props.style);

    // On native, behavior is preserved and web padding is not added
    expect(element.props.behavior).toBe('padding');
    expect(flatStyle?.paddingBottom).toBeUndefined();
  });

  it('adds dynamic paddingBottom matching keyboardHeight on Web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockKeyboardHeight = 336;

    const element = KeyboardAvoidingView({ children: 'Web', style: { flex: 1 } });
    const flatStyle = StyleSheet.flatten(element.props.style);

    // On web, behavior is undefined and paddingBottom matches virtual keyboard height
    expect(element.props.behavior).toBeUndefined();
    expect(flatStyle?.paddingBottom).toBe(336);
    expect(flatStyle?.flex).toBe(1);
  });

  it('does not add paddingBottom on Web when keyboard is closed', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    mockKeyboardHeight = 0;

    const element = KeyboardAvoidingView({ children: 'Web' });
    const flatStyle = StyleSheet.flatten(element.props.style);

    expect(flatStyle?.paddingBottom).toBeUndefined();
  });
});

