import { ScrollView, StyleSheet, View } from 'react-native';

import { colors, gutter, size, space } from '@/theme';

import { Pressable } from './Pressable';
import { Text } from './Text';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Shown in blue after the label, e.g. Unread 4. */
  count?: number;
}

interface TabsProps<K extends string> {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
}

/** Underline tabs: idle 500 text-tertiary, selected 700 ink with a 2px ink underline. */
export function Tabs<K extends string>({ items, value, onChange }: TabsProps<K>) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
      >
        {items.map((item) => {
          const selected = item.key === value;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
              style={styles.tab}
              pressedOpacity={0.7}
            >
              <View style={styles.labelRow}>
                <Text variant={selected ? 'tabActive' : 'tab'} color={selected ? 'text' : 'textTertiary'}>
                  {item.label}
                </Text>
                {item.count ? (
                  <Text variant="tabActive" color="primary" style={styles.count}>
                    {item.count}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.underline, selected && styles.underlineOn]} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { paddingHorizontal: gutter, gap: space[5] },
  tab: { height: size.tabHeight + 2, justifyContent: 'flex-end' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  count: { fontSize: 14 },
  underline: { height: 2, borderRadius: 1, marginBottom: -1 },
  underlineOn: { backgroundColor: colors.text },
});
