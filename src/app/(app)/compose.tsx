import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, ImageIcon, MessageSquareText, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import { Avatar, CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useInbox } from '@/features/communities/hooks';
import { useCreatePost } from '@/features/feed/hooks';
import { useMe } from '@/features/profile/hooks';
import { pickImages } from '@/lib/media';
import { colors, fonts, gutter, radius, space } from '@/theme';

const MAX_LENGTH = 2000;

/** Text and photo posts, shared to one community or to your followers. */
export default function Compose() {
  const params = useLocalSearchParams<{ photo?: string }>();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const inbox = useInbox();
  const create = useCreatePost();
  const toast = useToast();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const communities = inbox.data?.map((e) => e.community) ?? [];
  const target = communities.find((c) => c.id === communityId) ?? null;
  const dirty = text.trim().length > 0 || photos.length > 0;

  const addPhotos = async (source: 'library' | 'camera') => {
    const uris = await pickImages(source, 4 - photos.length);
    if (uris.length) setPhotos((p) => [...p, ...uris].slice(0, 4));
  };

  // Opened from the Feed's photo button: go straight to the library.
  useEffect(() => {
    if (!params.photo) return;
    void pickImages('library', 4).then((uris) => uris.length && setPhotos(uris));
  }, [params.photo]);

  const close = () => (dirty ? setDiscard(true) : router.back());

  const submit = () => {
    setError(null);
    create.mutate(
      { text: text.trim(), communityId, mediaUris: photos },
      {
        onSuccess: () => {
          toast.show({ message: target ? `Posted to ${target.name}` : 'Posted' });
          router.back();
        },
        onError: (e) => setError(`Your post wasn't shared. ${describeError(e)}`),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close" onPress={close} />
        <Text variant="screenTitle" style={styles.title} accessibilityRole="header">
          New post
        </Text>
        <Button label="Post" size="small" onPress={submit} loading={create.isPending} disabled={!dirty || text.length > MAX_LENGTH} style={styles.post} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Banner tone="warning" message={error} /> : null}
        <View style={styles.authorRow}>
          <Avatar name={me.data?.displayName ?? ''} uri={me.data?.avatarUrl} size={40} />
          <Pressable
            onPress={() => setPicking(true)}
            style={styles.audience}
            accessibilityRole="button"
            accessibilityLabel={`Posting to ${target?.name ?? 'your followers'}. Change`}
          >
            {target ? <CommunityAvatar id={target.id} monogram={target.monogram} uri={target.photoUrl} size={20} /> : null}
            <Text variant="name" numberOfLines={1} style={styles.audienceText}>
              {target?.name ?? 'Your followers'}
            </Text>
            <ChevronDown size={16} color={colors.text} strokeWidth={2} />
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Share something with your communities"
          placeholderTextColor={colors.textTertiary}
          multiline
          autoFocus={!params.photo}
          style={styles.input}
          accessibilityLabel="Post text"
          maxFontSizeMultiplier={1.6}
        />
        {text.length > MAX_LENGTH - 200 ? (
          <Text variant="meta" color={text.length > MAX_LENGTH ? 'warning' : 'textTertiary'} style={styles.counter}>
            {text.length > MAX_LENGTH ? `${text.length - MAX_LENGTH} characters over the limit` : `${MAX_LENGTH - text.length} characters left`}
          </Text>
        ) : null}
        {photos.length ? (
          <View style={styles.photos}>
            {photos.map((uri, i) => (
              <View key={uri} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo ${i + 1}`} />
                <Pressable onPress={() => setPhotos((p) => p.filter((u) => u !== uri))} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={8}>
                  <X size={14} color={colors.onPrimary} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, space[2]) }]}>
        <IconButton icon={ImageIcon} label="Add photos" color="textSecondary" disabled={photos.length >= 4} onPress={() => void addPhotos('library')} />
        <IconButton icon={Camera} label="Take a photo" color="textSecondary" disabled={photos.length >= 4} onPress={() => void addPhotos('camera')} />
        <Text variant="meta" color="textTertiary" style={styles.toolbarHint}>
          Up to 4 photos
        </Text>
      </View>

      <ActionSheet
        visible={picking}
        title="Post to"
        onClose={() => setPicking(false)}
        actions={[
          { label: 'Your followers', icon: Users, onPress: () => setCommunityId(null) },
          ...communities.map((c) => ({ label: c.name, icon: MessageSquareText, onPress: () => setCommunityId(c.id) })),
        ]}
      />
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
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  toolbarHint: { marginLeft: 'auto', marginRight: gutter - 6 },
});
