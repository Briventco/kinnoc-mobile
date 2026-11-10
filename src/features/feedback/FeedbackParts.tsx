import { Bug, ChevronRight, Lightbulb, MessageSquareText, Sparkles, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { FeedbackCategory, FeedbackStatus, FeedbackSummary } from '@/api/types';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { formatDay } from '@/lib/format';
import { colors, gutter, radius, space, type ColorName } from '@/theme';

import { CATEGORY_COPY, STATUS_COPY } from './model';

export const CATEGORY_ICON: Record<FeedbackCategory, LucideIcon> = {
  general: MessageSquareText,
  bug: Bug,
  feature: Lightbulb,
  experience: Sparkles,
};

/** One of the four kinds of feedback on the Feedback home screen. */
export function CategoryCard({ category, onPress, disabled }: { category: FeedbackCategory; onPress: () => void; disabled?: boolean }) {
  const Icon = CATEGORY_ICON[category];
  const copy = CATEGORY_COPY[category];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.card, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={`${copy.title}. ${copy.description}`}
      accessibilityState={{ disabled: !!disabled }}
      pressedOpacity={0.7}
      testID={`feedback-category-${category}`}
    >
      <View style={styles.iconBox}>
        <Icon size={22} color={colors.primary} strokeWidth={1.9} />
      </View>
      <View style={styles.flex}>
        <Text variant="rowTitle">{copy.title}</Text>
        <Text variant="preview" color="textSecondary">
          {copy.description}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.75} />
    </Pressable>
  );
}

const STATUS_LOOK: Record<FeedbackStatus, { bg: string; fg: ColorName }> = {
  received: { bg: colors.surface2, fg: 'textSecondary' },
  'under-review': { bg: colors.primarySubtle, fg: 'primary' },
  'in-progress': { bg: colors.primarySubtle, fg: 'brandNavy' },
  resolved: { bg: colors.successSubtle, fg: 'success' },
  closed: { bg: colors.surface3, fg: 'textTertiary' },
};

/** The submission's status, always in words. */
export function StatusPill({ status }: { status: FeedbackStatus }) {
  const look = STATUS_LOOK[status];
  return (
    <View style={[styles.pill, { backgroundColor: look.bg }]} accessibilityLabel={`Status: ${STATUS_COPY[status].label}`} testID="feedback-status">
      <Text variant="meta" color={look.fg} numberOfLines={1}>
        {STATUS_COPY[status].label}
      </Text>
    </View>
  );
}

/** A submission in the viewer's history: subject, category, date and status. */
export function FeedbackRow({ item, onPress }: { item: FeedbackSummary; onPress: () => void }) {
  const Icon = CATEGORY_ICON[item.category];
  const category = CATEGORY_COPY[item.category].short;
  const date = formatDay(item.createdAt);
  const replies = item.responseCount === 1 ? '1 reply' : item.responseCount > 1 ? `${item.responseCount} replies` : null;
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${item.subject}. ${category}, sent ${date}. Status: ${STATUS_COPY[item.status].label}${replies ? `. ${replies} from the Kinnoc team` : ''}`}
      pressedOpacity={0.7}
    >
      <View style={styles.rowIcon}>
        <Icon size={20} color={colors.textSecondary} strokeWidth={1.75} />
      </View>
      <View style={styles.flex}>
        <Text variant="rowTitle" numberOfLines={2}>
          {item.subject}
        </Text>
        <Text variant="meta" color="textTertiary" numberOfLines={1}>
          {[category, date, replies].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <StatusPill status={item.status} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.feature,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.45 },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start', flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: gutter, paddingVertical: space[3], minHeight: 72 },
  rowIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
