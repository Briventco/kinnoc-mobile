import { ArrowDown } from 'lucide-react-native';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { PULL_MAX, PULL_TRIGGER } from '@/lib/useWebPullToRefresh';
import { colors, shadow, space } from '@/theme';

/**
 * The web's pull indicator: an arrow that follows the finger and turns once the pull is far
 * enough, then a small spinner while the feed refreshes (from a pull or the header button).
 */
export function PullIndicator({ pull, refreshing }: { pull: Animated.Value; refreshing: boolean }) {
  const progress = pull.interpolate({ inputRange: [0, PULL_TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' });
  const translateY = pull.interpolate({ inputRange: [0, PULL_MAX], outputRange: [-44, PULL_MAX / 2], extrapolate: 'clamp' });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View pointerEvents="none" style={styles.pullWrap}>
      {refreshing ? (
        <View style={styles.pullBubble}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <Animated.View style={[styles.pullBubble, { opacity: progress, transform: [{ translateY }, { rotate }] }]}>
          <ArrowDown size={18} color={colors.primary} strokeWidth={2} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pullWrap: { position: 'absolute', top: space[2], left: 0, right: 0, alignItems: 'center' },
  pullBubble: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.float },
});
