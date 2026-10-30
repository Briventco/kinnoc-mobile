import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Pressable } from '@/components/Pressable';
import { ErrorState, SkeletonBlock } from '@/components/States';
import { Text } from '@/components/Text';
import { useCategories } from '@/features/communities/hooks';
import { colors, radius, space } from '@/theme';

/** The API keeps at most 20 interests per person. */
export const MAX_INTERESTS = 20;

/**
 * Interests from the API's catalogue (`GET /interests`) as toggles, by slug. Used in profile setup
 * and Edit profile; the caller saves the selection.
 */
export function InterestPicker({ picked, onChange, label = 'Interests' }: { picked: string[]; onChange: (slugs: string[]) => void; label?: string | null }) {
  const options = useCategories();
  const full = picked.length >= MAX_INTERESTS;
  const toggle = (slug: string) => onChange(picked.includes(slug) ? picked.filter((s) => s !== slug) : full ? picked : [...picked, slug]);

  return (
    <View style={styles.root}>
      {label ? (
        <Text variant="label" color="textTertiary">
          {label}
        </Text>
      ) : null}
      {options.isPending ? (
        <View style={styles.tags} accessible accessibilityLabel="Loading interests" accessibilityRole="progressbar">
          {[88, 120, 72, 104, 96, 80].map((w) => (
            <SkeletonBlock key={w} style={{ width: w, height: 36, borderRadius: radius.tag }} />
          ))}
        </View>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} style={styles.error} />
      ) : (
        <>
          <View style={styles.tags}>
            {options.data.map((c) => {
              const on = picked.includes(c.slug);
              const blocked = !on && full;
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => toggle(c.slug)}
                  disabled={blocked}
                  style={[styles.tag, on && styles.tagOn]}
                  accessibilityRole="checkbox"
                  accessibilityLabel={c.name}
                  accessibilityState={{ checked: on, disabled: blocked }}
                >
                  {on ? <Check size={14} color={colors.primary} strokeWidth={2.5} /> : null}
                  <Text variant="name" color={on ? 'primary' : blocked ? 'textTertiary' : 'text'} style={styles.tagText}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="meta" color="textTertiary">
            {full ? `That's the most you can pick (${MAX_INTERESTS}).` : picked.length ? `${picked.length} picked. People see these on your profile.` : 'Pick what you’re into. You can leave this empty.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.tag, paddingHorizontal: 12, minHeight: 36 },
  tagOn: { borderColor: colors.primarySubtleStrong, backgroundColor: colors.primarySubtle },
  tagText: { fontSize: 14 },
  error: { marginHorizontal: 0 },
});
