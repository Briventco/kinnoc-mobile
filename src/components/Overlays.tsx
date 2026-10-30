import type { LucideIcon } from 'lucide-react-native';
import { Modal, Platform, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gutter, radius, shadow, space } from '@/theme';

import { Button } from './Button';
import { Pressable } from './Pressable';
import { Text } from './Text';

interface ConfirmDialogProps {
  visible: boolean;
  /** A question: "Leave Tech Creators?" */
  title: string;
  body: string;
  /** Repeats the verb: "Leave". */
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms a consequential action. The back gesture cancels. */
export function ConfirmDialog({ visible, title, body, confirmLabel, destructive, loading, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text variant="headline" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="message" color="textSecondary">
            {body}
          </Text>
          <View style={styles.dialogActions}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'warning' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              fullWidth
            />
            <Button label="Cancel" variant="text" subdued onPress={onCancel} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export interface SheetAction {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
}

/** Secondary actions as a bottom sheet. Destructive items come last, in warning. */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const regular = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  const renderItem = (a: SheetAction) => (
    <Pressable
      key={a.label}
      accessibilityRole="button"
      onPress={() => {
        onClose();
        // iOS cannot present a picker or another modal while this one is still dismissing.
        setTimeout(a.onPress, Platform.OS === 'ios' ? 450 : 0);
      }}
      style={styles.item}
    >
      <a.icon size={20} color={a.destructive ? colors.warning : colors.text} strokeWidth={1.75} />
      <Text variant="tab" color={a.destructive ? 'warning' : 'text'}>
        {a.label}
      </Text>
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <RNPressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[2] }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        {title ? (
          <Text variant="label" color="textTertiary" style={styles.sheetTitle}>
            {title}
          </Text>
        ) : null}
        {regular.map(renderItem)}
        {destructive.length ? <View style={styles.divider} /> : null}
        {destructive.map(renderItem)}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: gutter },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    padding: space[6],
    gap: space[3],
    ...shadow.float,
  },
  dialogActions: { marginTop: space[3], gap: space[1] },
  sheetScrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space[2],
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.surface3, marginBottom: space[2] },
  sheetTitle: { paddingHorizontal: gutter + 4, paddingVertical: space[2] },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter + 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space[1] },
});
