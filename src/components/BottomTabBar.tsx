import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Compass, House, MessageSquareText, User, type LucideIcon } from 'lucide-react-native';
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
 */
export function BottomTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const keyboard = useKeyboardVisible();
  const inbox = useInbox();
  const hasUnread = inbox.data?.some((e) => e.unreadCount > 0 && !e.isMuted) ?? false;

  if (keyboard) return null;

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
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
            <View>
              <Icon size={24} color={tint} strokeWidth={focused ? 2.1 : 1.75} />
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: colors.border,
  },
  item: { flex: 1, height: size.navHeight - 4, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tick: { position: 'absolute', top: -1, width: 22, height: 3, borderRadius: 2 },
  tickOn: { backgroundColor: colors.brandBlue },
  label: { fontSize: 12, lineHeight: 16 },
});
