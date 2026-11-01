import { router } from 'expo-router';
import { Plus, User } from 'lucide-react-native';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { StoryReel } from '@/api/types';
import { Pressable } from '@/components/Pressable';
import { SkeletonBlock } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { describeError } from '@/api/errors';
import { pickImages } from '@/lib/media';
import { colors, gutter } from '@/theme';

import { useCreateStory, useStories } from './hooks';

const SIZE = 56;
const RING = 2.5;

/** Stories always show a face: the person's photo, or a neutral silhouette, never initials. */
export function StoryAvatar({ uri, size }: { uri: string | null; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  return uri ? (
    <Image source={{ uri }} style={[box, styles.photo]} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[box, styles.silhouette]}>
      <User size={size * 0.5} color={colors.textTertiary} strokeWidth={1.75} />
    </View>
  );
}

function Bubble({ reel, onPress, onAdd, busy }: { reel: StoryReel; onPress: () => void; onAdd?: () => void; busy?: boolean }) {
  const hasFrames = reel.frames.length > 0;
  const ringColor = reel.isMine
    ? hasFrames
      ? colors.brandBlue
      : colors.border
    : reel.seen
      ? colors.border
      : colors.brandBlue;
  const label = reel.isMine ? 'Your story' : reel.author.displayName.split(' ')[0];
  return (
    // The "+" is a sibling of the story button, laid over it, so screen readers reach both.
    <View style={styles.item}>
      <Pressable
        onPress={onPress}
        style={styles.itemButton}
        accessibilityRole="button"
        accessibilityLabel={reel.isMine ? (hasFrames ? 'Your story. Opens your story' : 'Add to your story') : `${reel.author.displayName}'s story${reel.seen ? ', seen' : ', new'}`}
        pressedOpacity={0.75}
      >
        <View style={[styles.ring, { borderColor: ringColor }, busy && styles.busy]}>
          <StoryAvatar uri={reel.author.avatarUrl} size={SIZE} />
        </View>
        <Text variant="meta" color={reel.isMine || !reel.seen ? 'text' : 'textTertiary'} numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Pressable>
      {reel.isMine && onAdd ? (
        <Pressable onPress={onAdd} style={styles.add} accessibilityRole="button" accessibilityLabel="Add a photo to your story" hitSlop={8}>
          <Plus size={13} color="#FFFFFF" strokeWidth={2.75} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Stories row at the top of the Feed: your story first, then unseen, then seen. */
export function StoryRow() {
  const stories = useStories();
  const create = useCreateStory();
  const toast = useToast();

  const addStory = async () => {
    const [uri] = await pickImages('library', 1);
    if (!uri) return;
    create.mutate(
      { mediaUri: uri, caption: null },
      {
        onSuccess: () => toast.show({ message: 'Added to your story' }),
        onError: (e) => toast.show({ message: `Story not shared. ${describeError(e)}` }),
      },
    );
  };

  if (stories.isPending) {
    return (
      <View style={[styles.row, styles.skeleton]}>
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBlock key={i} style={{ width: SIZE + RING * 4, height: SIZE + RING * 4, borderRadius: SIZE }} />
        ))}
      </View>
    );
  }
  // A failed stories load should not block the Feed; the row simply hides.
  if (stories.isError || !stories.data?.length) return null;

  const reels = stories.data;
  const others = reels.filter((r) => !r.isMine && r.frames.length);
  const open = (authorId: string) => router.push({ pathname: '/stories/[id]', params: { id: authorId } });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="Stories">
      {reels.map((reel) =>
        reel.isMine ? (
          <Bubble
            key="mine"
            reel={reel}
            busy={create.isPending}
            onPress={() => (reel.frames.length ? open(reel.author.id) : void addStory())}
            onAdd={() => void addStory()}
          />
        ) : reel.frames.length ? (
          <Bubble key={reel.author.id} reel={reel} onPress={() => open(reel.author.id)} />
        ) : null,
      )}
      {!others.length ? (
        <Text variant="preview" color="textTertiary" style={styles.none}>
          Stories from people in your communities show up here.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 10, gap: 14, backgroundColor: colors.surface },
  skeleton: { flexDirection: 'row' },
  item: { width: SIZE + 12 },
  itemButton: { alignItems: 'center', gap: 6 },
  ring: { padding: 2.5, borderRadius: (SIZE + 10) / 2, borderWidth: RING, backgroundColor: colors.surface },
  busy: { opacity: 0.5 },
  add: {
    position: 'absolute',
    top: SIZE - 14,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brandBlue,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { maxWidth: SIZE + 16, textAlign: 'center', fontSize: 12, lineHeight: 16 },
  photo: { backgroundColor: colors.surface3 },
  silhouette: { backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  none: { alignSelf: 'center', maxWidth: 220 },
});
