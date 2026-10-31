import { BadgeCheck } from 'lucide-react-native';
import { Modal, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Verification } from '@/api/types';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { formatDay } from '@/lib/format';
import { colors, gutter, radius, shadow, space } from '@/theme';

import { CATEGORY_LABEL, verificationDetail } from './labels';

/**
 * Why someone is verified, from the public verification record only: the category, position and
 * organisation an administrator confirmed, and when. Internal notes and reasons are never part
 * of the public record, so they cannot appear here.
 */
export function VerificationSheet({ verification, name, onClose }: { verification: Verification | null; name: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const v = verification;
  const category = v?.category && v.category !== 'other' ? CATEGORY_LABEL[v.category] : null;
  const detail = v ? verificationDetail(v) : null;
  return (
    <Modal visible={!!v?.isVerified} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]} accessibilityViewIsModal>
        <View style={styles.head}>
          <BadgeCheck size={28} color={colors.onPrimary} fill={colors.primary} strokeWidth={2} />
          <Text variant="headline" accessibilityRole="header">
            Verified account
          </Text>
        </View>
        <Text variant="message" color="textSecondary">
          Kinnoc has verified {name} as:
        </Text>
        <View style={styles.facts}>
          {category ? <Text variant="rowTitle">{category}</Text> : null}
          {detail ? <Text variant="post">{detail}</Text> : null}
          {!category && !detail ? <Text variant="rowTitle">A verified member of Kinnoc</Text> : null}
        </View>
        {v?.verifiedAt ? (
          <Text variant="meta" color="textTertiary">
            Verified since {formatDay(v.verifiedAt)}
          </Text>
        ) : null}
        <Text variant="meta" color="textTertiary">
          The blue tick means Kinnoc confirmed who this person is and their role. It is not an endorsement of what they post.
        </Text>
        <Button label="Done" variant="quiet" onPress={onClose} fullWidth />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space[5],
    paddingHorizontal: gutter + 4,
    gap: space[3],
    ...shadow.float,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  facts: { gap: 2, paddingVertical: space[1] },
});
