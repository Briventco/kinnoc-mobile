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
import { VerifiedName } from '@/features/verification/VerifiedBadge';
import { ProfileLink } from '@/features/profile/ProfileLink';
import { plural } from '@/lib/format';
import { useRelativeTime } from '@/lib/useRelativeTime';
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
  const formattedAge = useRelativeTime(post.createdAt);
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
    <View style={detail ? styles.detailRow : styles.card}>
      <View style={styles.header}>
        <ProfileLink username={post.author.username} label={`${post.author.displayName}'s profile`}>
          <Avatar name={post.author.displayName} uri={post.author.avatarUrl} size={42} />
        </ProfileLink>
        <View style={styles.flex}>
          {/* Only the name is the link; the community name and time beside it stay their own. */}
          <ProfileLink username={post.author.username} label={`${post.author.displayName}'s profile`} style={styles.nameLink}>
            <VerifiedName name={post.author.displayName} username={post.author.username} />
          </ProfileLink>
          <View style={styles.metaRow}>
            {post.community ? (
              <>
                <Text
                  variant="meta"
                  color="textSecondary"
                  onPress={() => router.push({ pathname: '/community/[id]/info', params: { id: post.community!.id } })}
                  accessibilityRole="link"
                  style={styles.communityName}
                  numberOfLines={1}
                >
                  in {post.community.name}
                </Text>
                <Text variant="meta" color="textTertiary">
                  {' · '}
                </Text>
              </>
            ) : null}
            <Text variant="meta" color="textTertiary" numberOfLines={1}>
              {formattedAge}
              {post.editedAt ? ' · Edited' : ''}
            </Text>
          </View>
        </View>
        <IconButton icon={Ellipsis} label="More actions for this post" color="textTertiary" size={20} onPress={() => setMenu(true)} />
      </View>

      {post.text ? (
        <Pressable onPress={open} disabled={detail} pressedOpacity={0.85} accessibilityHint={detail ? undefined : 'Opens the post and replies'}>
          <Text
            variant="post"
            style={styles.postText}
            numberOfLines={expanded ? undefined : 6}
          >
            {post.text}
          </Text>
        </Pressable>
      ) : null}
      {truncated && !expanded ? (
        <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" hitSlop={8} style={styles.seeMore}>
          <Text variant="name" color="primary">
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
          style={[styles.actionPill, post.likedByMe && styles.actionPillLiked]}
          pressedOpacity={0.7}
        >
          <Heart
            size={18}
            color={post.likedByMe ? colors.primary : colors.textTertiary}
            fill={post.likedByMe ? colors.primary : 'none'}
            strokeWidth={1.9}
          />
          {post.likeCount ? (
            <Text
              variant="name"
              style={[styles.actionCount, post.likedByMe && styles.actionCountLiked]}
            >
              {post.likeCount}
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`Replies, ${post.commentCount}`}
          style={styles.actionPill}
          pressedOpacity={0.7}
        >
          <MessageCircle size={18} color={colors.textTertiary} strokeWidth={1.9} />
          {post.commentCount ? (
            <Text variant="name" color="textTertiary" style={styles.actionCount}>
              {post.commentCount}
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share post"
          style={styles.actionPill}
          pressedOpacity={0.7}
        >
          <Send size={17} color={colors.textTertiary} strokeWidth={1.9} />
        </Pressable>

        <View style={styles.flex} />

        {saving ? (
          <Pressable
            onPress={() => save.mutate({ target: { kind: 'post', post }, saved: !post.savedByMe })}
            accessibilityRole="button"
            accessibilityLabel={post.savedByMe ? 'Remove from Saved' : 'Save'}
            style={[styles.actionPill, styles.actionPillRight, post.savedByMe && styles.actionPillLiked]}
            pressedOpacity={0.7}
          >
            <Bookmark
              size={18}
              color={post.savedByMe ? colors.primary : colors.textTertiary}
              fill={post.savedByMe ? colors.primary : 'none'}
              strokeWidth={1.9}
            />
          </Pressable>
        ) : null}
      </View>

      {!detail && post.topReply ? (
        <Pressable onPress={open} style={styles.replyBox} accessibilityHint="Opens all replies">
          <Avatar name={post.topReply.author?.displayName ?? ''} uri={post.topReply.author?.avatarUrl} size={22} />
          <View style={styles.flex}>
            <Text variant="preview" numberOfLines={2}>
              <Text variant="name" style={styles.replyName}>
                {post.topReply.author?.displayName.split(' ')[0] ?? 'Former member'}
              </Text>{' '}
              {post.topReply.text}
            </Text>
            {moreReplies > 0 ? (
              <Text variant="meta" color="primary" style={styles.moreReplies}>
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
      <Pressable onPress={onPress} disabled={disabled} pressedOpacity={0.92} style={styles.mediaContainer}>
        <Image source={{ uri: m.url }} style={[styles.media, { aspectRatio: ratio }]} contentFit="cover" transition={200} accessibilityLabel={m.alt ?? 'Photo'} />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} pressedOpacity={0.92} style={styles.grid} accessibilityLabel={`${media.length} photos`}>
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
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  detailRow: {
    paddingHorizontal: gutter,
    paddingTop: space[4],
    paddingBottom: space[3],
    gap: space[3],
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex: { flex: 1, minWidth: 0 },
  nameLink: { alignSelf: 'flex-start', maxWidth: '100%' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  communityName: { maxWidth: 160 },
  postText: { fontSize: 15, lineHeight: 22, color: colors.text },
  seeMore: { marginTop: -4, alignSelf: 'flex-start' },
  mediaContainer: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface3 },
  media: { width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface3 },
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  actionPillLiked: {
    backgroundColor: colors.primarySubtle,
  },
  actionPillRight: {
    paddingHorizontal: 11,
  },
  actionCount: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  actionCountLiked: {
    color: colors.primary,
  },
  replyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.surface2,
    padding: 10,
    borderRadius: 14,
    marginTop: 2,
  },
  replyName: { fontSize: 13, color: colors.text },
  moreReplies: { marginTop: 4, fontSize: 12 },
});
