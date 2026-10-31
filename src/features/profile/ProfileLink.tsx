import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/Pressable';

/** Where someone's profile lives: `/profile/<username>`, shareable on the web. */
export const profileHref = (username: string) => ({ pathname: '/profile/[username]' as const, params: { username } });

/**
 * Makes a person's avatar or name open their profile. A real link (an anchor on the web, so it
 * can be opened in a new tab or shared). Without a username (a deleted or former member) the
 * content is shown as it is, not interactive.
 *
 * Keep it around the identity only, never around a row's own buttons (like, comment, menu), so
 * those never navigate by accident and screen readers reach each control.
 */
export function ProfileLink({
  username,
  label,
  children,
  style,
}: {
  username: string | null | undefined;
  /** What a screen reader says, e.g. "Ada Okafor's profile". */
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!username) return <View style={style}>{children}</View>;
  return (
    <Link href={profileHref(username)} asChild>
      <Pressable style={style} accessibilityRole="link" accessibilityLabel={label} accessibilityHint="Opens their profile" pressedOpacity={0.7} hitSlop={4}>
        {children}
      </Pressable>
    </Link>
  );
}
