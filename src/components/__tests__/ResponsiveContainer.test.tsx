import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

import { colors } from '@/theme';

import { DESKTOP_MAX_WIDTH, ResponsiveContainer } from '../ResponsiveContainer';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: jest.fn(() => ({ width: 375, height: 812 })),
}));

describe('ResponsiveContainer', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  });

  it('renders children directly without wrapping views on native platforms', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 390, height: 844 });

    const element = ResponsiveContainer({ children: 'Native content' });
    // Fragment props contain children directly
    expect(element.props.children).toBe('Native content');
  });

  it('renders fluid full-width layout for mobile web screens (<= 480px)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 375, height: 812 });

    const element = ResponsiveContainer({ children: 'Mobile web' });
    const viewport = element;
    const column = element.props.children;

    const viewportStyle = StyleSheet.flatten(viewport.props.style);
    const columnStyle = StyleSheet.flatten(column.props.style);

    expect(viewportStyle.backgroundColor).toBe(colors.surface);
    expect(columnStyle.width).toBe('100%');
    expect(columnStyle.maxWidth).toBeUndefined();
    expect(column.props.children).toBe('Mobile web');
  });

  it('renders centered phone-width container on desktop web (> 480px)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1280, height: 900 });

    const element = ResponsiveContainer({ children: 'Desktop web' });
    const viewport = element;
    const column = element.props.children;

    const viewportStyle = StyleSheet.flatten(viewport.props.style);
    const columnStyle = StyleSheet.flatten(column.props.style);

    // Viewport has mist background and centers content
    expect(viewportStyle.backgroundColor).toBe(colors.surface2);
    expect(viewportStyle.alignItems).toBe('center');
    expect(viewportStyle.justifyContent).toBe('center');

    // Column is constrained to DESKTOP_MAX_WIDTH (480px) with hairlines
    expect(columnStyle.maxWidth).toBe(DESKTOP_MAX_WIDTH);
    expect(columnStyle.borderLeftWidth).toBeGreaterThan(0);
    expect(columnStyle.borderRightWidth).toBeGreaterThan(0);
    expect(columnStyle.borderColor).toBe(colors.border);
    expect(columnStyle.overflow).toBe('hidden');
    expect(column.props.children).toBe('Desktop web');
  });
});
