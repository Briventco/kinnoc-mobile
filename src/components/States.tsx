import { Bookmark, CircleAlert, CircleCheck, Info, WifiOff } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ApiError, describeError } from '@/api/errors';
import { colors, communityRadius, gutter, radius, shadow, space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

/* ---------- Skeleton ---------- */

function usePulse() {
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 0.5, duration: 700, useNativeDriver: true }),
          Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [value]);
  return value;
}

export function SkeletonBlock({ style }: { style: StyleProp<ViewStyle> }) {
  return <View style={[styles.block, style]} />;
}

/** Placeholder rows shaped like the real list: avatar plus two lines (40% / 25%). */
export function SkeletonList({
  rows = 6,
  shape = 'circle',
  media = false,
}: {
  rows?: number;
  shape?: 'circle' | 'square';
  media?: boolean;
}) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ opacity }}
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonHead}>
            <SkeletonBlock
              style={{ width: 44, height: 44, borderRadius: shape === 'circle' ? 22 : communityRadius(44) }}
            />
            <View style={styles.skeletonLines}>
              <SkeletonBlock style={{ width: '40%', height: 12 }} />
              <SkeletonBlock style={{ width: '25%', height: 10 }} />
            </View>
          </View>
          {media && i === 0 ? <SkeletonBlock style={styles.skeletonMedia} /> : null}
        </View>
      ))}
    </Animated.View>
  );
}

/** Bubbles shaped like a conversation, for chat history that is still loading. */
const BUBBLES: { mine: boolean; width: `${number}%`; lines: number }[] = [
  { mine: false, width: '62%', lines: 2 },
  { mine: false, width: '44%', lines: 1 },
  { mine: true, width: '52%', lines: 1 },
  { mine: false, width: '70%', lines: 3 },
  { mine: true, width: '38%', lines: 1 },
  { mine: true, width: '58%', lines: 2 },
];

export function MessageSkeleton() {
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.bubbles, { opacity }]} accessible accessibilityLabel="Loading messages" accessibilityRole="progressbar">
      {BUBBLES.map((b, i) => (
        <View key={i} style={[styles.bubbleRow, b.mine && styles.bubbleRowMine]}>
          {!b.mine ? <SkeletonBlock style={styles.bubbleAvatar} /> : null}
          <SkeletonBlock style={{ width: b.width, height: 18 + b.lines * 18, borderRadius: radius.bubble }} />
        </View>
      ))}
    </Animated.View>
  );
}

/* ---------- Banners and errors ---------- */

type BannerTone = 'warning' | 'success' | 'offline' | 'info';

export function Banner({
  tone,
  message,
  actionLabel,
  onAction,
  style,
}: {
  tone: BannerTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    warning: { bg: colors.warningSubtle, fg: 'warning' as const, Icon: CircleAlert },
    success: { bg: colors.successSubtle, fg: 'success' as const, Icon: CircleCheck },
    offline: { bg: colors.surface3, fg: 'text' as const, Icon: WifiOff },
    info: { bg: colors.surface2, fg: 'textSecondary' as const, Icon: Info },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <palette.Icon size={18} color={colors[palette.fg]} strokeWidth={2} />
      <Text variant="preview" color={palette.fg} style={styles.flex}>
        {message}
      </Text>
      {actionLabel && onAction ? <Button variant="text" label={actionLabel} onPress={onAction} style={styles.bannerAction} /> : null}
    </View>
  );
}

/** Inline failure with Retry, for a list or screen that could not load. */
export function ErrorState({ error, onRetry, style }: { error: unknown; onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  const offline = error instanceof ApiError && error.code === 'network';
  // Features the backend does not offer yet are not failures, and retrying cannot help.
  const unavailable = error instanceof ApiError && error.code === 'unsupported';
  return (
    <Banner
      tone={unavailable ? 'info' : offline ? 'offline' : 'warning'}
      message={describeError(error)}
      actionLabel={onRetry && !unavailable ? 'Retry' : undefined}
      onAction={onRetry}
      style={[styles.errorState, style]}
    />
  );
}

/* ---------- Empty state ---------- */

/**
 * Shows what the space will hold: ghost rows with one lifted row, a headline that states
 * the fact, one sentence with the next step, a primary action and an optional link.
 */
export function EmptyState({
  title,
  body,
  action,
  secondary,
  lifted,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  /** Leading element of the lifted row; defaults to a filled bookmark row. */
  lifted?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.illustration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GhostRow />
        <View style={styles.liftedRow}>
          {lifted ?? <SkeletonBlock style={styles.ghostSquare} />}
          <View style={styles.skeletonLines}>
            <View style={[styles.ghostLine, { width: '80%', backgroundColor: colors.textSecondary }]} />
            <View style={[styles.ghostLine, { width: '40%' }]} />
          </View>
          <Bookmark size={22} color={colors.primary} fill={colors.primary} strokeWidth={1.75} />
        </View>
        <GhostRow round />
      </View>
      <Text variant="pageTitle" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="post" color="textSecondary" style={styles.emptyBody}>
        {body}
      </Text>
      {action || secondary ? (
        <View style={styles.emptyActions}>
          {action ? <Button label={action.label} onPress={action.onPress} /> : null}
          {secondary ? <Button variant="text" subdued label={secondary.label} onPress={secondary.onPress} style={styles.secondary} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function GhostRow({ round }: { round?: boolean }) {
  return (
    <View style={styles.ghostRow}>
      <View style={[styles.ghostSquare, { backgroundColor: colors.surface2 }, round && { borderRadius: 22 }]} />
      <View style={styles.skeletonLines}>
        <View style={[styles.ghostLine, { width: '70%', backgroundColor: colors.surface2 }]} />
        <View style={[styles.ghostLine, { width: '45%', backgroundColor: colors.surface2 }]} />
      </View>
    </View>
  );
}

/* ---------- Misc ---------- */

export function ListFooter({ loading }: { loading: boolean }) {
  return <View style={styles.footer}>{loading ? <ActivityIndicator color={colors.textTertiary} /> : null}</View>;
}

export function CenteredSpinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.textTertiary} />
    </View>
  );
}

export function Hairline({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}

const styles = StyleSheet.create({
  bubbles: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: gutter, paddingBottom: space[3], gap: space[2] },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleAvatar: { width: 28, height: 28, borderRadius: 14 },
  flex: { flex: 1 },
  block: { backgroundColor: colors.surface3, borderRadius: 6 },
  skeletonRow: { paddingHorizontal: gutter, paddingVertical: 14, gap: 12 },
  skeletonHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonMedia: { height: 200, borderRadius: radius.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    minHeight: 52,
    borderRadius: radius.md,
  },
  bannerAction: { paddingHorizontal: 8 },
  errorState: { marginHorizontal: gutter, marginVertical: space[4] },
  empty: { paddingHorizontal: space[6], paddingTop: space[8], gap: 12 },
  illustration: { marginBottom: space[6], gap: 10 },
  ghostRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 4 },
  liftedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginHorizontal: -10,
    backgroundColor: colors.surface,
    borderRadius: radius.feature + 2,
    ...shadow.float,
  },
  ghostSquare: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface3 },
  ghostLine: { height: 10, borderRadius: 5, backgroundColor: colors.surface3 },
  emptyBody: { marginBottom: space[3] },
  emptyActions: { flexDirection: 'row', alignItems: 'center', gap: space[5], flexWrap: 'wrap' },
  secondary: { paddingHorizontal: 0 },
  footer: { height: 64, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[8] },
});
