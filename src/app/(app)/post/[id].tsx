import { useLocalSearchParams } from 'expo-router';
import { ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { Comment } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/Header';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, Hairline, ListFooter } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAddComment, useComments, usePost } from '@/features/feed/hooks';
import { PostRow } from '@/features/feed/PostRow';
import { flatten } from '@/lib/cache';
import { formatAge } from '@/lib/format';
import { colors, fonts, gutter, radius, space } from '@/theme';

function CommentRow({ comment }: { comment: Comment }) {
  return (
    <View style={styles.comment}>
      <Avatar name={comment.author.displayName} uri={comment.author.avatarUrl} size={32} />
      <View style={styles.flex}>
        <Text variant="meta" color="textTertiary">
          <Text variant="name" style={styles.commentName}>
            {comment.author.displayName}
          </Text>{' '}
          · {formatAge(comment.createdAt)}
        </Text>
        <Text variant="message">{comment.text}</Text>
      </View>
    </View>
  );
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const post = usePost(id);
  const comments = useComments(id);
  const add = useAddComment(id);
  const toast = useToast();
  const [text, setText] = useState('');

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    add.mutate(value, {
      onSuccess: () => setText(''),
      onError: (e) => toast.show({ message: `Reply not sent. ${describeError(e)}`, aboveNav: false }),
    });
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Post" />
      {post.isPending ? (
        <CenteredSpinner />
      ) : post.isError ? (
        <ErrorState error={post.error} onRetry={() => post.refetch()} />
      ) : (
        <>
          <FlatList
            data={flatten(comments.data)}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => <CommentRow comment={item} />}
            ListHeaderComponent={
              <>
                <PostRow post={post.data} detail />
                <Hairline />
                <Text variant="label" color="textTertiary" style={styles.repliesLabel}>
                  Replies
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
                  No replies yet. Start the conversation.
                </Text>
              )
            }
            ListFooterComponent={<ListFooter loading={comments.isFetchingNextPage} />}
            onEndReached={() => comments.hasNextPage && !comments.isFetchingNextPage && comments.fetchNextPage()}
            keyboardShouldPersistTaps="handled"
          />
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a reply"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={styles.input}
              accessibilityLabel="Write a reply"
              maxFontSizeMultiplier={1.6}
            />
            {text.trim() ? (
              <Pressable onPress={submit} disabled={add.isPending} style={styles.send} accessibilityRole="button" accessibilityLabel="Send reply" accessibilityState={{ busy: add.isPending }}>
                <ArrowUp size={22} color={colors.onPrimary} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  repliesLabel: { paddingHorizontal: gutter, paddingTop: space[4], paddingBottom: space[1] },
  noReplies: { paddingHorizontal: gutter, paddingVertical: space[4] },
  comment: { flexDirection: 'row', gap: space[3], paddingHorizontal: gutter, paddingVertical: space[3] },
  commentName: { fontSize: 14 },
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
});
