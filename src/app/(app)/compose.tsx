import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, Globe, ImageIcon, Link2, MessageSquareText, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { Post } from '@/api/types';
import { Avatar, CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Banner, CenteredSpinner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useInbox } from '@/features/communities/hooks';
import { MAX_POST_IMAGES, POST_MAX_LENGTH, validateLink } from '@/features/feed/drafts';
import { useCreatePost, usePost, useUpdatePost } from '@/features/feed/hooks';
import { useMe } from '@/features/profile/hooks';
import { pickImages } from '@/lib/media';
import { KEYBOARD_BEHAVIOR, useBottomBarInset } from '@/lib/useKeyboardVisible';
import { colors, fonts, gutter, radius, space } from '@/theme';

/**
 * New posts (text, up to four photos, an optional link) to everyone or to one community, and
 * editing a post's text and link. `?communityId=` preselects a community; `?edit=<post id>` edits.
 */
export default function Compose() {
  const params = useLocalSearchParams<{ photo?: string; communityId?: string; edit?: string }>();
  return params.edit ? <EditPost postId={params.edit} /> : <NewPost openPhotos={!!params.photo} initialCommunityId={params.communityId ?? null} />;
}

function NewPost({ openPhotos, initialCommunityId }: { openPhotos: boolean; initialCommunityId: string | null }) {
  const inbox = useInbox();
  const create = useCreatePost();
  const toast = useToast();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(initialCommunityId);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Posting to a community needs active membership: the inbox lists exactly those.
  const communities = inbox.data?.map((e) => e.community) ?? [];
  const target = communities.find((c) => c.id === communityId) ?? null;
  const linkCheck = validateLink(link);
  const linkError = 'error' in linkCheck && link.trim() ? linkCheck.error : null;
  const dirty = text.trim().length > 0 || photos.length > 0 || link.trim().length > 0;

  const addPhotos = async (source: 'library' | 'camera') => {
    const uris = await pickImages(source, MAX_POST_IMAGES - photos.length);
    if (uris.length) setPhotos((p) => [...p, ...uris].slice(0, MAX_POST_IMAGES));
  };

  // Opened from the Feed's photo button: go straight to the library.
  useEffect(() => {
    if (!openPhotos) return;
    void pickImages('library', MAX_POST_IMAGES).then((uris) => uris.length && setPhotos(uris));
  }, [openPhotos]);

  const submit = () => {
    setError(null);
    create.mutate(
      { text, communityId, photos, link },
      {
        onSuccess: () => {
          toast.show({ message: target ? `Posted to ${target.name}` : 'Posted' });
          router.back();
        },
        // Retrying sends the same post: photos already uploaded are not uploaded again.
        onError: (e) => setError(`Your post wasn't shared. ${describeError(e)}`),
      },
    );
  };

  return (
    <EditorFrame
      title="New post"
      action="Post"
      busy={create.isPending}
      canSubmit={text.trim().length > 0 && text.length <= POST_MAX_LENGTH && !linkError}
      dirty={dirty}
      onSubmit={submit}
      toolbar={
        <>
          <IconButton icon={ImageIcon} label="Add photos" color="textSecondary" disabled={photos.length >= MAX_POST_IMAGES || create.isPending} onPress={() => void addPhotos('library')} />
          <IconButton icon={Camera} label="Take a photo" color="textSecondary" disabled={photos.length >= MAX_POST_IMAGES || create.isPending} onPress={() => void addPhotos('camera')} />
          <IconButton icon={Link2} label="Add a link" color={showLink ? 'primary' : 'textSecondary'} disabled={create.isPending} onPress={() => setShowLink(true)} />
          <Text variant="meta" color="textTertiary" style={styles.toolbarHint}>
            Up to {MAX_POST_IMAGES} photos
          </Text>
        </>
      }
    >
      {error ? <Banner tone="warning" message={error} /> : null}
      <View style={styles.authorRow}>
        <MyAvatar />
        <Pressable
          onPress={() => setPicking(true)}
          disabled={create.isPending}
          style={styles.audience}
          accessibilityRole="button"
          accessibilityLabel={`Posting to ${target?.name ?? 'everyone'}. Change`}
        >
          {target ? <CommunityAvatar id={target.id} monogram={target.monogram} uri={target.photoUrl} size={20} /> : <Globe size={16} color={colors.text} strokeWidth={2} />}
          <Text variant="name" numberOfLines={1} style={styles.audienceText}>
            {target?.name ?? 'Everyone'}
          </Text>
          <ChevronDown size={16} color={colors.text} strokeWidth={2} />
        </Pressable>
      </View>
      <PostTextInput value={text} onChange={setText} autoFocus={!openPhotos} />
      {photos.length ? (
        <View style={styles.photos}>
          {photos.map((uri, i) => (
            <View key={uri} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
              {create.isPending ? null : (
                <Pressable onPress={() => setPhotos((p) => p.filter((u) => u !== uri))} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={8}>
                  <X size={14} color={colors.onPrimary} strokeWidth={2.5} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {showLink || link ? <LinkInput value={link} onChange={setLink} error={linkError} autoFocus={showLink && !link} /> : null}

      <ActionSheet
        visible={picking}
        title="Post to"
        onClose={() => setPicking(false)}
        actions={[
          { label: 'Everyone', icon: Globe, onPress: () => setCommunityId(null) },
          ...communities.map((c) => ({ label: c.name, icon: MessageSquareText, onPress: () => setCommunityId(c.id) })),
        ]}
      />
    </EditorFrame>
  );
}

function EditPost({ postId }: { postId: string }) {
  const insets = useSafeAreaInsets();
  const post = usePost(postId);
  if (post.isPending || post.isError) {
    return (
      <View style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <ScreenHeader title="Edit post" />
        {post.isPending ? <CenteredSpinner /> : <ErrorState error={post.error} onRetry={() => post.refetch()} />}
      </View>
    );
  }
  return <PostEditor post={post.data} />;
}

/** Text and link only: the API keeps a post's photos and community. */
function PostEditor({ post }: { post: Post }) {
  const update = useUpdatePost(post.id);
  const toast = useToast();
  const [text, setText] = useState(post.text);
  const [link, setLink] = useState(post.link?.url ?? '');
  const [error, setError] = useState<string | null>(null);

  const linkCheck = validateLink(link);
  const linkError = 'error' in linkCheck && link.trim() ? linkCheck.error : null;
  const dirty = text !== post.text || link !== (post.link?.url ?? '');

  const submit = () => {
    if ('error' in linkCheck) return;
    setError(null);
    update.mutate(
      { text: text.trim(), link: linkCheck.url },
      {
        onSuccess: () => {
          toast.show({ message: 'Post updated' });
          router.back();
        },
        onError: (e) => setError(`Your changes weren't saved. ${describeError(e)}`),
      },
    );
  };

  return (
    <EditorFrame
      title="Edit post"
      action="Save"
      busy={update.isPending}
      canSubmit={dirty && text.trim().length > 0 && text.length <= POST_MAX_LENGTH && !linkError}
      dirty={dirty}
      onSubmit={submit}
    >
      {error ? <Banner tone="warning" message={error} /> : null}
      <PostTextInput value={text} onChange={setText} autoFocus />
      <LinkInput value={link} onChange={setLink} error={linkError} />
      {post.media.length ? (
        <Text variant="meta" color="textTertiary">
          Photos can’t be changed after posting.
        </Text>
      ) : null}
    </EditorFrame>
  );
}

function EditorFrame({
  title,
  action,
  busy,
  canSubmit,
  dirty,
  onSubmit,
  toolbar,
  children,
}: {
  title: string;
  action: string;
  busy: boolean;
  canSubmit: boolean;
  dirty: boolean;
  onSubmit: () => void;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const toolbarInset = useBottomBarInset(insets.bottom);
  const [discard, setDiscard] = useState(false);
  const close = () => (dirty && !busy ? setDiscard(true) : router.back());

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]} behavior={KEYBOARD_BEHAVIOR}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close" onPress={close} />
        <Text variant="screenTitle" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {/* Disabled while sending, so a double tap cannot send twice. */}
        <Button label={action} size="small" onPress={onSubmit} loading={busy} disabled={!canSubmit || busy} style={styles.post} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>

      {toolbar ? <View style={[styles.toolbar, { paddingBottom: toolbarInset }]}>{toolbar}</View> : null}

      <ConfirmDialog
        visible={discard}
        title="Discard this post?"
        body="What you've written will be lost."
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          router.back();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function MyAvatar() {
  const me = useMe();
  return <Avatar name={me.data?.displayName ?? ''} uri={me.data?.avatarUrl} size={40} />;
}

function PostTextInput({ value, onChange, autoFocus }: { value: string; onChange: (text: string) => void; autoFocus?: boolean }) {
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Share something with your communities"
        placeholderTextColor={colors.textTertiary}
        multiline
        autoFocus={autoFocus}
        style={styles.input}
        accessibilityLabel="Post text"
        maxFontSizeMultiplier={1.6}
      />
      {value.length > POST_MAX_LENGTH - 200 ? (
        <Text variant="meta" color={value.length > POST_MAX_LENGTH ? 'warning' : 'textTertiary'} style={styles.counter}>
          {value.length > POST_MAX_LENGTH ? `${value.length - POST_MAX_LENGTH} characters over the limit` : `${POST_MAX_LENGTH - value.length} characters left`}
        </Text>
      ) : null}
    </>
  );
}

function LinkInput({ value, onChange, error, autoFocus }: { value: string; onChange: (text: string) => void; error: string | null; autoFocus?: boolean }) {
  return (
    <View style={styles.linkField}>
      <View style={[styles.linkRow, error && styles.linkRowError]}>
        <Link2 size={18} color={colors.textTertiary} strokeWidth={2} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Add a link (optional)"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          autoFocus={autoFocus}
          style={styles.linkInput}
          accessibilityLabel="Link"
          maxFontSizeMultiplier={1.6}
        />
        {value ? <IconButton icon={X} label="Remove link" color="textTertiary" size={18} onPress={() => onChange('')} /> : null}
      </View>
      {error ? (
        <Text variant="meta" color="warning" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, marginLeft: 4 },
  post: { marginRight: 10 },
  content: { padding: gutter, gap: space[3] },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.field, backgroundColor: colors.surface2, flexShrink: 1 },
  audienceText: { flexShrink: 1 },
  input: { minHeight: 140, fontFamily: fonts.body400, fontSize: 18, lineHeight: 26, color: colors.text, textAlignVertical: 'top' },
  counter: { textAlign: 'right' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  photoWrap: { width: '48%' },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: colors.surface3 },
  remove: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  linkField: { gap: space[1] },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, paddingLeft: 12, borderRadius: radius.field, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  linkRowError: { borderColor: colors.warning },
  linkInput: { flex: 1, minHeight: 44, fontFamily: fonts.body400, fontSize: 16, color: colors.text },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  toolbarHint: { marginLeft: 'auto', marginRight: gutter - 6 },
});
