import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Bookmark, Ellipsis, Heart, Link2, MessageCircle, Pencil, Send, Share2, Trash2 } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { describeError } from '@/api/errors';
import type { MediaAsset, Post } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog, type SheetAction } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useToggleSave } from '@/features/saved/hooks';
import { formatAge, plural } from '@/lib/format';
import { openExternal } from '@/lib/links';
import { api } from '@/services';
import { colors, gutter, radius, space } from '@/theme';

import { postGone, toggleLike, useDeletePost } from './hooks';

const LONG_POST = 320;

interface PostRowProps {
  post: Post;
  /** Detail screens show the full text and no reply preview. */
  detail?: boolean;
  /** The viewer moderates the post's community, so may delete it. */
  canModerate?: boolean;
}

/** A post is a row on paper: author, words, media, actions, then a hairline. */
export const PostRow = memo(function PostRow({ post, detail, canModerate }: PostRowProps) {
  const save = useToggleSave();
  const remove = useDeletePost();
  const toast = useToast();
  const [expanded, setExpanded] = useState(detail ?? false);
  // Long posts collapse to six lines; a length threshold behaves the same on iOS and Android.
  const truncated = post.text.length > LONG_POST;
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = () => !detail && router.push({ pathname: '/post/[id]', params: { id: post.id } });
  const moreReplies = post.commentCount - (post.topReply ? 1 : 0);
  const saving = api.capabilities.social;

  const like = () =>
    toggleLike(post).catch((error: unknown) =>
      toast.show({ message: postGone(error) ? 'This post was deleted.' : `Your like wasn't saved. ${describeError(error)}` }),
    );

  const share = () => {
    const where = post.community ? ` in ${post.community.name}` : '';
    void Share.share({ message: `${post.author.displayName}${where} on Kinnoc: ${post.text}` });
  };

  const actions: SheetAction[] = [
    ...(saving
      ? [{ label: post.savedByMe ? 'Remove from Saved' : 'Save', icon: Bookmark, onPress: () => save.mutate({ target: { kind: 'post', post }, saved: !post.savedByMe }) }]
      : []),
    { label: 'Share', icon: Share2, onPress: share },
    ...(post.isMine ? [{ label: 'Edit post', icon: Pencil, onPress: () => router.push({ pathname: '/compose', params: { edit: post.id } }) }] : []),
    ...(post.isMine || canModerate ? [{ label: 'Delete post', icon: Trash2, destructive: true, onPress: () => setConfirmDelete(true) }] : []),
  ];

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Avatar name={post.author.displayName} uri={post.author.avatarUrl} size={40} />
        <View style={styles.flex}>
          <Text variant="name" numberOfLines={1}>
            {post.author.displayName}
          </Text>
          <Text variant="meta" color="textTertiary" numberOfLines={1}>
            {post.community ? (
              <Text
                variant="meta"
                color="textSecondary"
                onPress={() => router.push({ pathname: '/community/[id]/info', params: { id: post.community!.id } })}
                accessibilityRole="link"
              >
                {post.community.name}
              </Text>
            ) : null}
            {post.community ? ' · ' : ''}
            {formatAge(post.createdAt)}
            {post.editedAt ? ' · Edited' : ''}
          </Text>
        </View>
        <IconButton icon={Ellipsis} label="More actions for this post" color="textTertiary" size={20} onPress={() => setMenu(true)} />
      </View>

      {post.text ? (
        <Pressable onPress={open} disabled={detail} pressedOpacity={0.8} accessibilityHint={detail ? undefined : 'Opens the post and replies'}>
          <Text
            variant="post"
            numberOfLines={expanded ? undefined : 6}
          >
            {post.text}
          </Text>
        </Pressable>
      ) : null}
      {truncated && !expanded ? (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" hitSlop={8} style={styles.seeMore}>
          <Text variant="name" color="textSecondary">
            See more
          </Text>
        </Pressable>
      ) : null}

      {post.media.length ? <PostMedia media={post.media} onPress={open} disabled={detail} /> : null}

      {post.link ? (
        <Pressable
          onPress={() => void openExternal(post.link!.url)}
          style={styles.link}
          accessibilityRole="link"
          accessibilityLabel={`Link to ${post.link.domain}`}
          accessibilityHint="Opens in the browser"
        >
          <Link2 size={18} color={colors.primary} strokeWidth={2} />
          <View style={styles.flex}>
            <Text variant="name" numberOfLines={1}>
              {post.link.domain}
            </Text>
            <Text variant="meta" color="textTertiary" numberOfLines={1}>
              {post.link.url}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={like}
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: post.likedByMe }}
          accessibilityValue={{ text: plural(post.likeCount, 'like') }}
          style={styles.action}
        >
          <Heart size={22} color={post.likedByMe ? colors.primary : colors.textTertiary} fill={post.likedByMe ? colors.primary : 'none'} strokeWidth={1.75} />
          {post.likeCount ? (
            <Text variant="name" color={post.likedByMe ? 'primary' : 'textTertiary'}>
              {post.likeCount}
            </Text>
          ) : null}
        </Pressable>
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Replies, ${post.commentCount}`} style={styles.action}>
          <MessageCircle size={22} color={colors.textTertiary} strokeWidth={1.75} />
          {post.commentCount ? (
            <Text variant="name" color="textTertiary">
              {post.commentCount}
            </Text>
          ) : null}
        </Pressable>
        <IconButton icon={Send} label="Share" color="textTertiary" onPress={share} />
        <View style={styles.flex} />
        {saving ? (
          <IconButton
            icon={Bookmark}
            label={post.savedByMe ? 'Remove from Saved' : 'Save'}
            color={post.savedByMe ? 'primary' : 'textTertiary'}
            fill={post.savedByMe ? 'primary' : undefined}
            onPress={() => save.mutate({ target: { kind: 'post', post }, saved: !post.savedByMe })}
          />
        ) : null}
      </View>

      {!detail && post.topReply ? (
        <Pressable onPress={open} style={styles.reply} accessibilityHint="Opens all replies">
          <Avatar name={post.topReply.author?.displayName ?? ''} uri={post.topReply.author?.avatarUrl} size={24} />
          <View style={styles.flex}>
            <Text variant="preview" numberOfLines={2}>
              <Text variant="name" style={styles.replyName}>
                {post.topReply.author?.displayName.split(' ')[0] ?? 'Former member'}
              </Text>{' '}
              {post.topReply.text}
            </Text>
            {moreReplies > 0 ? (
              <Text variant="meta" color="textSecondary" style={styles.moreReplies}>
                View {plural(moreReplies, 'more reply', 'more replies')}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}

      <ActionSheet visible={menu} actions={actions} onClose={() => setMenu(false)} />
      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this post?"
        body="It will be removed from your profile and from the Feed. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove.mutate(post, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.show({ message: 'Post deleted' });
              if (detail) router.back();
            },
            onError: (error) => {
              setConfirmDelete(false);
              toast.show({ message: `Couldn't delete the post. ${describeError(error)}` });
            },
          })
        }
      />
    </View>
  );
});

/** Up to four photos: one at its own shape, more as a grid of squares. Sizes the uploader did not send are shown 4:3. */
function PostMedia({ media, onPress, disabled }: { media: MediaAsset[]; onPress: () => void; disabled?: boolean }) {
  if (media.length === 1) {
    const [m] = media;
    const ratio = m.width && m.height ? Math.max(0.8, Math.min(1.91, m.width / m.height)) : 4 / 3;
    return (
      <Pressable onPress={onPress} disabled={disabled} pressedOpacity={0.9}>
        <Image source={{ uri: m.url }} style={[styles.media, { aspectRatio: ratio }]} contentFit="cover" transition={200} accessibilityLabel={m.alt ?? 'Photo'} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} pressedOpacity={0.9} style={styles.grid} accessibilityLabel={`${media.length} photos`}>
      {media.map((m, i) => (
        <Image
          key={m.id}
          source={{ uri: m.url }}
          // Three photos: the first spans the top row.
          style={[styles.tile, media.length === 3 && i === 0 && styles.tileWide]}
          contentFit="cover"
          transition={200}
          accessibilityLabel={m.alt ?? `Photo ${i + 1}`}
        />
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[2], gap: space[3], backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginRight: -10 },
  flex: { flex: 1, minWidth: 0 },
  seeMore: { marginTop: -space[2], alignSelf: 'flex-start' },
  media: { width: '100%', borderRadius: radius.md, backgroundColor: colors.surface3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderRadius: radius.md, overflow: 'hidden' },
  tile: { width: '49.4%', aspectRatio: 1, backgroundColor: colors.surface3 },
  tileWide: { width: '100%', aspectRatio: 2 },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: -6, marginRight: -10 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 6, marginRight: space[3] },
  reply: { flexDirection: 'row', gap: 10, paddingBottom: space[2] },
  replyName: { fontSize: 14 },
  moreReplies: { marginTop: 4 },
});
