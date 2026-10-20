import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StoryFrame, StoryReel } from '@/api/types';
import { IconButton } from '@/components/IconButton';
import { Text } from '@/components/Text';
import { useMarkStorySeen, useStories } from '@/features/stories/hooks';
import { StoryAvatar } from '@/features/stories/StoryRow';
import { formatAge } from '@/lib/format';
import { colors, gutter, space, type } from '@/theme';

const FRAME_MS = 5000;

const BACKGROUNDS: Record<Extract<StoryFrame, { kind: 'text' }>['background'], string> = {
  navy: colors.brandNavy,
  blue: colors.primary,
  ink: colors.text,
};

export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stories = useStories();
  // Freeze the order on open so marking frames seen doesn't reshuffle reels mid-viewing.
  const [reels] = useState<StoryReel[]>(() => (stories.data ?? []).filter((r) => r.frames.length));
  const startReel = Math.max(0, reels.findIndex((r) => r.author.id === id));

  if (!reels.length) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <IconButton icon={X} label="Close stories" color="onPrimary" onPress={() => router.back()} style={styles.emptyClose} />
      </View>
    );
  }
  return <Viewer reels={reels} startReel={startReel} />;
}

function Viewer({ reels, startReel }: { reels: StoryReel[]; startReel: number }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const markSeen = useMarkStorySeen();
  const [reelIndex, setReelIndex] = useState(startReel);
  const [frameIndex, setFrameIndex] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const [loadedFrameId, setLoadedFrameId] = useState<string | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const nextRef = useRef<() => void>(() => {});
  const longPressed = useRef(false);

  const reel = reels[reelIndex];
  const frame = reel.frames[frameIndex];
  // Text frames show at once; photos wait for onLoad (or a 3 s fallback).
  const ready = frame.kind === 'text' || loadedFrameId === frame.id;

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
  }, []);

  const run = useCallback(
    (duration: number) => {
      animation.current?.stop();
      animation.current = Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false });
      animation.current.start(({ finished }) => finished && nextRef.current());
    },
    [progress],
  );

  const next = useCallback(() => {
    if (frameIndex < reel.frames.length - 1) setFrameIndex((i) => i + 1);
    else if (reelIndex < reels.length - 1) {
      setReelIndex((i) => i + 1);
      setFrameIndex(0);
    } else router.back();
  }, [frameIndex, reel.frames.length, reelIndex, reels.length]);

  const prev = useCallback(() => {
    if (frameIndex > 0) setFrameIndex((i) => i - 1);
    else if (reelIndex > 0) {
      setReelIndex((i) => i - 1);
      setFrameIndex(reels[reelIndex - 1].frames.length - 1);
    } else {
      progress.setValue(0);
      run(FRAME_MS);
    }
  }, [frameIndex, reelIndex, reels, progress, run]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  // New frame: reset the bar and mark it seen.
  useEffect(() => {
    progress.setValue(0);
    animation.current?.stop();
    if (!reel.isMine) markSeen.mutate(frame.id);
    // markSeen is a stable mutation handle; re-running on its identity would re-mark frames.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id, reel.isMine, progress]);

  useEffect(() => {
    if (frame.kind !== 'image') return;
    const t = setTimeout(() => setLoadedFrameId(frame.id), 3000);
    return () => clearTimeout(t);
  }, [frame]);

  // Screen-reader users advance with swipe actions; everyone else auto-advances.
  useEffect(() => {
    if (ready && !screenReader) run(FRAME_MS);
    return () => animation.current?.stop();
  }, [ready, screenReader, run, frame.id]);

  const pause = () => animation.current?.stop();
  const resume = () =>
    progress.stopAnimation((v) => {
      if (ready && !screenReader) run(FRAME_MS * (1 - v));
    });

  const onTap = (e: GestureResponderEvent) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (e.nativeEvent.locationX < width / 3) prev();
    else next();
  };

  const bars = useMemo(() => reel.frames.map((f) => f.id), [reel.frames]);
  const name = reel.isMine ? 'Your story' : reel.author.displayName;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTap}
        onPressIn={pause}
        onPressOut={resume}
        onLongPress={() => {
          longPressed.current = true;
        }}
        delayLongPress={250}
        accessibilityRole="button"
        accessibilityLabel={`${name}, story ${frameIndex + 1} of ${reel.frames.length}. ${frame.kind === 'text' ? frame.text : (frame.caption ?? 'Photo')}`}
        accessibilityHint="Tap the right side for next, left side for previous. Hold to pause."
        accessibilityActions={[{ name: 'increment', label: 'Next' }, { name: 'decrement', label: 'Previous' }]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? next() : prev())}
      >
        {frame.kind === 'image' ? (
          <>
            <Image source={{ uri: frame.url }} style={StyleSheet.absoluteFill} contentFit="contain" onLoad={() => setLoadedFrameId(frame.id)} transition={120} />
            {frame.caption ? (
              <View style={[styles.captionWrap, { paddingBottom: insets.bottom + space[6] }]}>
                <Text variant="post" color="onPrimary" style={styles.caption}>
                  {frame.caption}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={[styles.textFrame, { backgroundColor: BACKGROUNDS[frame.background] }]}>
            <Text style={styles.storyText} maxFontSizeMultiplier={1.4}>
              {frame.text}
            </Text>
          </View>
        )}
      </Pressable>

      <View style={[styles.top, { paddingTop: insets.top + space[2] }]} pointerEvents="box-none">
        <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {bars.map((fid, i) => (
            <View key={fid} style={styles.track}>
              <Animated.View
                style={[
                  styles.fill,
                  {
                    width: i < frameIndex ? '100%' : i > frameIndex ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.header}>
          <StoryAvatar uri={reel.author.avatarUrl} size={36} />
          <Text variant="name" color="onPrimary" numberOfLines={1} style={styles.flex}>
            {name}{' '}
            <Text variant="meta" color="onNavySecondary">
              {formatAge(frame.createdAt)}
            </Text>
          </Text>
          <IconButton icon={X} label="Close stories" color="onPrimary" size={26} onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1, minWidth: 0 },
  emptyClose: { position: 'absolute', top: 60, right: 10 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: colors.onPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: space[2], paddingLeft: 4 },
  textFrame: { flex: 1, justifyContent: 'center', paddingHorizontal: space[8] },
  storyText: { ...type.hero, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: colors.onPrimary },
  captionWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: gutter, paddingTop: space[6], backgroundColor: 'rgba(0,0,0,0.35)' },
  caption: { textAlign: 'center' },
});
