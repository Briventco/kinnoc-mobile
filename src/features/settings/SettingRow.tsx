import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Switch, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { colors, gutter, space } from '@/theme';

interface SettingRowProps {
  icon?: LucideIcon;
  label: string;
  detail?: string;
  onPress?: () => void;
  warning?: boolean;
}

export function SettingRow({ icon: Icon, label, detail, onPress, warning }: SettingRowProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={detail ? `${label}, ${detail}` : label}>
      {Icon ? <Icon size={20} color={warning ? colors.warning : colors.text} strokeWidth={1.75} /> : null}
      <View style={styles.flex}>
        <Text variant="tab" color={warning ? 'warning' : 'text'}>
          {label}
        </Text>
        {detail ? (
          <Text variant="meta" color="textTertiary">
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress && !warning ? <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.75} /> : null}
    </Pressable>
  );
}

export function ToggleRow({ label, detail, value, onChange, disabled }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text variant="tab">{label}</Text>
        {detail ? (
          <Text variant="meta" color="textTertiary">
            {detail}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.surface3 }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.surface3}
      />
    </View>
  );
}

export function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color="textTertiary" style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter, paddingVertical: space[2] },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  section: { paddingTop: space[5], borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space[2] },
  sectionTitle: { paddingHorizontal: gutter, paddingBottom: space[1] },
});
