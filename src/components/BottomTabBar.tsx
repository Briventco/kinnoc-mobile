import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Compass, House, MessageSquareText, Plus, User, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useInbox } from '@/features/communities/hooks';
import { useKeyboardVisible } from '@/lib/useKeyboardVisible';
import { colors, fonts, size } from '@/theme';

import { NewDot } from './IconButton';
import { Pressable } from './Pressable';
import { Text } from './Text';

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Feed', icon: House },
  communities: { label: 'Communities', icon: MessageSquareText },
  discover: { label: 'Discover', icon: Compass },
  profile: { label: 'Profile', icon: User },
};

/**
 * The only top-level navigation, docked to the bottom so the navigator reserves its height
 * (plus the home-indicator inset) and content never scrolls underneath it.
 * Active: action-blue icon and label with a logo-blue tick. A dot on Communities means unread.
 * Center: Quick-action Compose button inspired by modern mobile social design.
 */
export function BottomTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const keyboard = useKeyboardVisible();
  const inbox = useInbox();
  const hasUnread = inbox.data?.some((e) => e.unreadCount > 0 && !e.isMuted) ?? false;

  if (keyboard) return null;

  const leftRoutes = state.routes.slice(0, 2);
  const rightRoutes = state.routes.slice(2);

  const renderTab = (route: typeof state.routes[0], index: number) => {
    const tab = TABS[route.name];
    if (!tab) return null;
    const focused = index === state.index;
    const { options } = descriptors[route.key];
    const showDot = route.name === 'communities' && hasUnread;
    const Icon = tab.icon;
    const tint = focused ? colors.primary : colors.textTertiary;

    const onPress = () => {
      const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
    };

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? (showDot ? `${tab.label}, unread messages` : tab.label)}
        style={styles.item}
        pressedOpacity={0.7}
      >
        <View style={[styles.tick, focused && styles.tickOn]} />
        <View style={styles.iconBox}>
          <Icon size={23} color={tint} strokeWidth={focused ? 2.2 : 1.75} />
          {showDot ? <NewDot /> : null}
        </View>
        <Text
          style={[styles.label, { fontFamily: focused ? fonts.body700 : fonts.body500, color: tint }]}
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {leftRoutes.map((r, i) => renderTab(r, i))}

      <View style={styles.composeWrap}>
        <Pressable
          onPress={() => router.push('/compose')}
          accessibilityRole="button"
          accessibilityLabel="Create a new post"
          style={styles.composeButton}
          pressedOpacity={0.8}
        >
          <Plus size={21} color="#FFFFFF" strokeWidth={2.75} />
        </Pressable>
      </View>

      {rightRoutes.map((r, i) => renderTab(r, i + 2))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 3,
  },
  item: { flex: 1, height: size.navHeight - 2, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconBox: { position: 'relative' },
  tick: { position: 'absolute', top: -1, width: 22, height: 3, borderRadius: 2 },
  tickOn: { backgroundColor: colors.brandBlue },
  label: { fontSize: 11, lineHeight: 14 },
  composeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  composeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primarySubtle,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
