import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials } from '@/lib/format';
import { colors, communityRadius, fonts, radius } from '@/theme';

import { Text } from './Text';

interface PersonAvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** People are always circles. No photo, or one that fails to load: Bricolage initials in navy on mist. */
export function Avatar({ name, uri, size = 40, style }: PersonAvatarProps) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  // Remembering which URI failed means a new photo is tried again.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={[styles.person, box, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {uri && uri !== failed ? (
        <Image source={{ uri }} style={box} contentFit="cover" transition={150} onError={() => setFailed(uri)} />
      ) : (
        <Text
          style={{ fontFamily: fonts.display600, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46) }}
          color="brandNavy"
          maxFontSizeMultiplier={1}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/**
 * Monogram fills, assigned from the community id so they never change.
 * Action blue is deliberately absent so a list never repeats it.
 */
const FILLS = [
  { bg: colors.brandNavy, fg: colors.onPrimary },
  { bg: colors.text, fg: colors.onPrimary },
  { bg: colors.primarySubtle, fg: colors.brandNavy },
  { bg: colors.surface3, fg: colors.text },
] as const;

function fillFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FILLS[h % FILLS.length];
}

interface CommunityAvatarProps {
  id: string;
  monogram: string;
  uri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** Communities are rounded squares (radius 30% of size): photo, or a Bricolage monogram. */
export function CommunityAvatar({ id, monogram, uri, size = 50, style }: CommunityAvatarProps) {
  const box = { width: size, height: size, borderRadius: communityRadius(size) };
  const fill = fillFor(id);
  return (
    <View
      style={[styles.community, box, { backgroundColor: uri ? colors.surface3 : fill.bg }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image source={{ uri }} style={box} contentFit="cover" transition={150} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.display700,
            fontSize: Math.round(size * (monogram.length > 1 ? 0.36 : 0.42)),
            lineHeight: Math.round(size * 0.5),
            color: fill.fg,
          }}
          maxFontSizeMultiplier={1}
        >
          {monogram.slice(0, 2).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** Organisation monogram for opportunities: same shape as communities, neutral fills. */
export function OrgMonogram({ id, monogram, size = 44 }: { id: string; monogram: string; size?: number }) {
  return <CommunityAvatar id={id} monogram={monogram} size={size} />;
}

/** 20px count pill. Muted counts are grey. 99+ above 99. */
export function CountBadge({ count, muted }: { count: number; muted?: boolean }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: muted ? colors.textTertiary : colors.primary }]}>
      <Text variant="meta" color="onPrimary" style={styles.badgeText} maxFontSizeMultiplier={1.3}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  person: {
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  community: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.body700, fontSize: 12, lineHeight: 16 },
});
