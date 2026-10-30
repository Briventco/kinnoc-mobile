import { BadgeCheck } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { Verification, VerificationCategory } from '@/api/types';
import { Text } from '@/components/Text';
import { colors, type ColorName, type TypeVariant } from '@/theme';

import { useVerification } from './hooks';

export const CATEGORY_LABEL: Record<VerificationCategory, string> = {
  founder: 'Founder',
  'student-leader': 'Student leader',
  'community-leader': 'Community leader',
  'organisation-representative': 'Organisation representative',
  other: 'Verified',
};

/** "Founder, Brivent Global Innovations": why the tick was given, or null without details. */
export function verificationDetail(v: Verification) {
  return [v.position, v.organisation].filter(Boolean).join(', ') || null;
}

/** What a screen reader says for the tick: "Verified founder, Founder, Brivent Global Innovations". */
export function verificationLabel(v: Verification) {
  const kind = v.category && v.category !== 'other' ? `Verified ${CATEGORY_LABEL[v.category].toLowerCase()}` : 'Verified';
  const detail = verificationDetail(v);
  return detail ? `${kind}, ${detail}` : kind;
}

/** Badge size for each name style it sits beside. */
const SIZE: Partial<Record<TypeVariant, number>> = { pageTitle: 20, display: 22, rowTitle: 16, name: 15, meta: 13 };

/**
 * The Kinnoc blue tick, drawn only for an active verification the API reported. Nothing renders
 * while loading or after a failed lookup, so a wrong badge never flashes.
 */
export function VerifiedBadge({ username, size = 15, style }: { username: string | null | undefined; size?: number; style?: StyleProp<ViewStyle> }) {
  const { data } = useVerification(username);
  if (!data?.isVerified) return null;
  return <Tick verification={data} size={size} style={style} />;
}

function Tick({ verification, size, style }: { verification: Verification; size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={verificationLabel(verification)}>
      <BadgeCheck size={size} color={colors.onPrimary} fill={colors.primary} strokeWidth={2} />
    </View>
  );
}

interface VerifiedNameProps {
  name: string;
  /** Whose badge to look up. Null for deleted or former members: no badge. */
  username: string | null | undefined;
  variant?: TypeVariant;
  color?: ColorName;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  /** Layout of the name and badge row, e.g. to let it shrink in a header. */
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * A display name with its blue tick after it. The name shrinks and truncates first, so the tick
 * stays visible on narrow screens.
 */
export function VerifiedName({ name, username, variant = 'name', color, numberOfLines = 1, style, containerStyle }: VerifiedNameProps) {
  const { data } = useVerification(username);
  const verified = !!data?.isVerified;
  return (
    <View style={[styles.row, containerStyle]}>
      <Text
        variant={variant}
        color={color}
        numberOfLines={numberOfLines}
        style={[styles.name, style]}
        accessibilityLabel={verified ? `${name}, ${verificationLabel(data)}` : undefined}
      >
        {name}
      </Text>
      {verified ? <Tick verification={data} size={SIZE[variant] ?? 15} style={styles.tick} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flexShrink: 1 },
  tick: { marginLeft: 4 },
});
