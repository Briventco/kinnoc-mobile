import { BadgeCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import type { Verification } from '@/api/types';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { colors, type ColorName, type TypeVariant } from '@/theme';

import { useVerification } from './hooks';
import { verificationLabel } from './labels';
import { VerificationSheet } from './VerificationSheet';

export { CATEGORY_LABEL, verificationDetail, verificationLabel } from './labels';

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
  /**
   * The tick opens a sheet saying why they are verified. For profile headers only: in a row the
   * name is already a link to the profile, and a button inside a link is unreachable.
   */
  explainable?: boolean;
}

/**
 * A display name with its blue tick after it. The name shrinks and truncates first, so the tick
 * stays visible on narrow screens.
 */
export function VerifiedName({ name, username, variant = 'name', color, numberOfLines = 1, style, containerStyle, explainable }: VerifiedNameProps) {
  const { data } = useVerification(username);
  const verified = !!data?.isVerified;
  const [explaining, setExplaining] = useState(false);
  const size = SIZE[variant] ?? 15;
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
      {verified && explainable ? (
        <Pressable
          onPress={() => setExplaining(true)}
          style={styles.tick}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`${verificationLabel(data)}. Why ${name} is verified`}
        >
          <BadgeCheck size={size} color={colors.onPrimary} fill={colors.primary} strokeWidth={2} />
        </Pressable>
      ) : verified ? (
        <Tick verification={data} size={size} style={styles.tick} />
      ) : null}
      {explainable ? <VerificationSheet verification={explaining && data ? data : null} name={name} onClose={() => setExplaining(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flexShrink: 1 },
  tick: { marginLeft: 4 },
});
