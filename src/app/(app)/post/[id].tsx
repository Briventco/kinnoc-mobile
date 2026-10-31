import { useLocalSearchParams } from 'expo-router';
import { ArrowUp, Ellipsis, Pencil, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Comment, Post } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog, type SheetAction } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, Hairline, ListFooter } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useCommunity } from '@/features/communities/hooks';
import { COMMENT_MAX_LENGTH, createIdempotencyKey } from '@/features/feed/drafts';
import { useAddComment, useComments, useDeleteComment, useEditComment, usePost, useReplies } from '@/features/feed/hooks';
import { PostRow } from '@/features/feed/PostRow';
import { VerifiedName } from '@/features/verification/VerifiedBadge';
import { ProfileLink } from '@/features/profile/ProfileLink';
import { flattenUnique } from '@/lib/cache';
import { formatAge, plural } from '@/lib/format';
import { KEYBOARD_BEHAVIOR, useBottomBarInset } from '@/lib/useKeyboardVisible';
import { colors, fonts, gutter, radius, space } from '@/theme';

type Mode = { kind: 'comment' } | { kind: 'reply'; to: Comment } | { kind: 'edit'; comment: Comment };

interface CommentActions {
  /** Who may delete: the comment's author, the post's author, the community's owners and moderators. */
  canDelete: (c: Comment) => boolean;
  onReply: (c: Comment) => void;
  onMore: (c: Comment) => void;
}

const firstName = (c: Comment) => c.author?.displayName.split(' ')[0] ?? 'Former member';

function CommentRow({ comment, actions, reply }: { comment: Comment; actions: CommentActions; reply?: boolean }) {
  const deleted = !!comment.deletedAt;
  const hasMenu = !deleted && (comment.isMine || actions.canDelete(comment));
  return (
    <View style={[styles.comment, reply && styles.reply]}>
      <ProfileLink username={deleted ? null : comment.author?.username} label={`${comment.author?.displayName ?? 'Their'}'s profile`}>
        <Avatar name={comment.author?.displayName ?? ''} uri={comment.author?.avatarUrl} size={reply ? 24 : 32} />
      </ProfileLink>
      <View style={styles.flex}>
        <View style={styles.commentHead}>
          <ProfileLink username={deleted ? null : comment.author?.username} label={`${comment.author?.displayName ?? 'Their'}'s profile`} style={styles.shrink}>
            <VerifiedName
              name={deleted ? 'Deleted' : (comment.author?.displayName ?? 'Former member')}
              username={deleted ? null : comment.author?.username}
              style={styles.commentName}
            />
          </ProfileLink>
          <Text variant="meta" color="textTertiary">
            {' '}
            · {formatAge(comment.createdAt)}
            {comment.editedAt && !deleted ? ' · Edited' : ''}
          </Text>
        </View>
        {deleted ? (
          <Text variant="message" color="textTertiary">
            This comment was deleted.
          </Text>
        ) : (
          <Text variant="message">{comment.text}</Text>
        )}
        {deleted ? null : (
          <Pressable onPress={() => actions.onReply(comment)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reply to ${firstName(comment)}`} style={styles.replyButton}>
            <Text variant="meta" color="textSecondary">
              Reply
            </Text>
          </Pressable>
        )}
      </View>
      {hasMenu ? <IconButton icon={Ellipsis} label="More actions for this comment" color="textTertiary" size={18} onPress={() => actions.onMore(comment)} /> : null}
    </View>
  );
}

/** A top-level comment and, once opened, its replies. */
function Thread({ postId, comment, actions }: { postId: string; comment: Comment; actions: CommentActions }) {
  const [open, setOpen] = useState(false);
  const replies = useReplies(postId, comment.id, open);
  const items = flattenUnique(replies.data, (c) => c.id);

  return (
    <View>
      <CommentRow comment={comment} actions={actions} />
      {open ? (
        <>
          {items.map((r) => (
            <CommentRow key={r.id} comment={r} actions={actions} reply />
          ))}
          {replies.isPending || replies.isFetchingNextPage ? <ListFooter loading /> : null}
          {replies.isError ? <ErrorState error={replies.error} onRetry={() => replies.refetch()} /> : null}
          {replies.hasNextPage && !replies.isFetching ? (
            <Pressable onPress={() => replies.fetchNextPage()} style={styles.threadToggle} accessibilityRole="button">
              <Text variant="meta" color="textSecondary">
                Show more replies
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : comment.replyCount > 0 ? (
        <Pressable onPress={() => setOpen(true)} style={styles.threadToggle} accessibilityRole="button">
          <Text variant="meta" color="textSecondary">
            View {plural(comment.replyCount, 'reply', 'replies')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const post = usePost(id);

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={KEYBOARD_BEHAVIOR}>
      <ScreenHeader title="Post" />
      {post.isPending ? (
        <CenteredSpinner />
      ) : post.isError ? (
        <ErrorState error={post.error} onRetry={() => post.refetch()} />
      ) : (
        <Discussion post={post.data} />
      )}
    </KeyboardAvoidingView>
  );
}

function Discussion({ post }: { post: Post }) {
  const insets = useSafeAreaInsets();
  const composerInset = useBottomBarInset(insets.bottom);
  const toast = useToast();
  const comments = useComments(post.id);
  const add = useAddComment(post.id);
  const edit = useEditComment(post.id);
  const remove = useDeleteComment(post.id);
  // The viewer's role in the post's community decides whether they may moderate it.
  const community = useCommunity(post.community?.id ?? '', !!post.community);
  const canModerate = !!post.community && (community.data?.role === 'owner' || community.data?.role === 'moderator');
  const [commentKey] = useState(createIdempotencyKey);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'comment' });
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

  const busy = add.isPending || edit.isPending;
  const value = text.trim();

  const actions: CommentActions = {
    canDelete: (c) => c.isMine || post.isMine || canModerate,
    // One level of replies: replying to a reply joins its thread (the top-level comment).
    onReply: (c) => {
      if (mode.kind === 'edit') setText('');
      setMode({ kind: 'reply', to: c.parentId ? { ...c, id: c.parentId, parentId: null } : c });
    },
    onMore: setMenuFor,
  };

  const items = flattenUnique(comments.data, (c) => c.id);

  const fail = (prefix: string) => (e: unknown) => {
    // A reused key the server rejects would fail every retry; start a new one.
    if (e instanceof ApiError && e.serverCode === 'CONFLICT') commentKey.reset();
    toast.show({ message: `${prefix} ${describeError(e)}`, aboveNav: false });
  };

  const submit = () => {
    if (!value || busy) return;
    if (mode.kind === 'edit') {
      edit.mutate(
        { commentId: mode.comment.id, text: value },
        {
          onSuccess: () => {
            setText('');
            setMode({ kind: 'comment' });
          },
          onError: fail('Your change wasn’t saved.'),
        },
      );
      return;
    }
    const parentId = mode.kind === 'reply' ? mode.to.id : null;
    add.mutate(
      // Same text, same target: a retry reuses the key, so a lost response cannot post twice.
      { clientId: commentKey.for(JSON.stringify([parentId, value])), text: value, parentId },
      {
        onSuccess: () => {
          commentKey.reset();
          setText('');
          setMode({ kind: 'comment' });
        },
        onError: fail(mode.kind === 'reply' ? 'Reply not sent.' : 'Comment not sent.'),
      },
    );
  };

  const menu: SheetAction[] = menuFor
    ? [
        ...(menuFor.isMine
          ? [
              {
                label: 'Edit',
                icon: Pencil,
                onPress: () => {
                  setMode({ kind: 'edit', comment: menuFor });
                  setText(menuFor.text);
                },
              },
            ]
          : []),
        ...(actions.canDelete(menuFor) ? [{ label: 'Delete', icon: Trash2, destructive: true, onPress: () => setConfirmDelete(menuFor) }] : []),
      ]
    : [];

  const placeholder = mode.kind === 'reply' ? `Reply to ${firstName(mode.to)}` : mode.kind === 'edit' ? 'Edit your comment' : 'Write a comment';

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <Thread postId={post.id} comment={item} actions={actions} />}
        ListHeaderComponent={
          <>
            <PostRow post={post} detail canModerate={canModerate} />
            <Hairline />
            <Text variant="label" color="textTertiary" style={styles.repliesLabel}>
              Comments
            </Text>
          </>
        }
        ListEmptyComponent={
          comments.isPending ? (
            <ListFooter loading />
          ) : comments.isError ? (
            <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
          ) : (
            <Text variant="preview" color="textTertiary" style={styles.noReplies}>
              No comments yet. Start the conversation.
            </Text>
          )
        }
        ListFooterComponent={<ListFooter loading={comments.isFetchingNextPage} />}
        onEndReached={() => comments.hasNextPage && !comments.isFetching && comments.fetchNextPage()}
        keyboardShouldPersistTaps="handled"
      />
      {mode.kind !== 'comment' ? (
        <View style={styles.modeBar}>
          <Text variant="meta" color="textSecondary" numberOfLines={1} style={styles.flex}>
            {mode.kind === 'reply' ? `Replying to ${firstName(mode.to)}` : 'Editing your comment'}
          </Text>
          <IconButton
            icon={X}
            label={mode.kind === 'reply' ? 'Cancel reply' : 'Cancel editing'}
            color="textTertiary"
            size={18}
            onPress={() => {
              if (mode.kind === 'edit') setText('');
              setMode({ kind: 'comment' });
            }}
          />
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: composerInset }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={COMMENT_MAX_LENGTH}
          style={styles.input}
          accessibilityLabel={placeholder}
          maxFontSizeMultiplier={1.6}
        />
        {value ? (
          <Pressable
            onPress={submit}
            disabled={busy}
            style={[styles.send, busy && styles.sendBusy]}
            accessibilityRole="button"
            accessibilityLabel={mode.kind === 'edit' ? 'Save comment' : 'Send comment'}
            accessibilityState={{ busy }}
          >
            <ArrowUp size={22} color={colors.onPrimary} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>

      <ActionSheet visible={!!menuFor} actions={menu} onClose={() => setMenuFor(null)} />
      <ConfirmDialog
        visible={!!confirmDelete}
        title="Delete this comment?"
        body={confirmDelete && !confirmDelete.parentId && confirmDelete.replyCount ? 'Its replies stay visible.' : "This can't be undone."}
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() =>
          remove.mutate(confirmDelete!, {
            onSuccess: () => {
              setConfirmDelete(null);
              toast.show({ message: 'Comment deleted', aboveNav: false });
            },
            onError: (e) => {
              setConfirmDelete(null);
              toast.show({ message: `Couldn't delete the comment. ${describeError(e)}`, aboveNav: false });
            },
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  repliesLabel: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[1] },
  noReplies: { paddingHorizontal: gutter, paddingVertical: space[4] },
  comment: { flexDirection: 'row', gap: space[3], paddingLeft: gutter, paddingRight: gutter - 10, paddingVertical: space[3] },
  reply: { paddingLeft: gutter + 44, paddingVertical: space[2] },
  commentName: { fontSize: 14 },
  commentHead: { flexDirection: 'row', alignItems: 'center' },
  shrink: { flexShrink: 1 },
  replyButton: { alignSelf: 'flex-start', marginTop: 4 },
  threadToggle: { paddingLeft: gutter + 44, paddingBottom: space[3], alignSelf: 'flex-start' },
  modeBar: { flexDirection: 'row', alignItems: 'center', paddingLeft: gutter, paddingRight: gutter - 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2], paddingHorizontal: gutter, paddingTop: space[2], borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.body400,
    fontSize: 16,
    color: colors.text,
  },
  send: { width: 40, height: 40, margin: 2, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBusy: { opacity: 0.5 },
});
