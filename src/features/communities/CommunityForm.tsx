import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { CommunityInput, CommunityVisibility, JoinPolicy } from '@/api/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { Banner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { pickImages } from '@/lib/media';
import { colors, communityRadius, gutter, radius, space } from '@/theme';

import { useCategories, useUploadCommunityImage } from './hooks';

/** Limits enforced by the API. */
export const NAME_MIN = 3;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 1000;

export interface CommunityFormValues {
  name: string;
  description: string;
  category: string | null;
  visibility: CommunityVisibility;
  joinPolicy: JoinPolicy;
}

type ImageState = { previewUrl: string | null; key: string | null | undefined; uploading: boolean };

const VISIBILITY: { key: CommunityVisibility; label: string; help: string }[] = [
  { key: 'public', label: 'Public', help: 'Anyone can find it in Discover and see what it is about.' },
  { key: 'unlisted', label: 'Unlisted', help: 'Hidden from Discover. People with the link can see it and join by the rules below.' },
  { key: 'private', label: 'Private', help: 'Hidden from everyone but members. People join only by invitation.' },
];

const POLICIES: { key: JoinPolicy; label: string; help: string }[] = [
  { key: 'open', label: 'Anyone', help: 'People join straight away.' },
  { key: 'approval', label: 'Approval', help: 'You or a moderator approve each request.' },
  { key: 'invite-only', label: 'Invite only', help: 'Only people you invite can join.' },
];

/** Client-side checks that mirror the API, so most mistakes are caught before sending. */
export function validateCommunity(v: CommunityFormValues) {
  const name = v.name.trim();
  const description = v.description.trim();
  return {
    name: !name ? 'Give your community a name.' : name.length < NAME_MIN ? `Use at least ${NAME_MIN} characters.` : name.length > NAME_MAX ? `Keep it under ${NAME_MAX} characters.` : null,
    description: !description ? 'Say what the community is about.' : description.length > DESCRIPTION_MAX ? `Keep it under ${DESCRIPTION_MAX} characters.` : null,
    category: v.category ? null : 'Choose a category.',
  };
}

interface CommunityFormProps {
  title: string;
  submitLabel: string;
  initial: CommunityFormValues;
  initialImages?: { avatarUrl: string | null; coverUrl: string | null };
  submitting: boolean;
  /** Receives only the fields to send; images only when changed. */
  onSubmit: (input: CommunityInput, done: { onError: (e: unknown) => void }) => void;
}

/** Create and edit share one form: identity images, name, description, category and access. */
export function CommunityForm({ title, submitLabel, initial, initialImages, submitting, onSubmit }: CommunityFormProps) {
  const insets = useSafeAreaInsets();
  const categories = useCategories();
  const upload = useUploadCommunityImage();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string | null | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<ImageState>({ previewUrl: initialImages?.avatarUrl ?? null, key: undefined, uploading: false });
  const [cover, setCover] = useState<ImageState>({ previewUrl: initialImages?.coverUrl ?? null, key: undefined, uploading: false });

  const set = <K extends keyof CommunityFormValues>(key: K, value: CommunityFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const setVisibility = (visibility: CommunityVisibility) =>
    // Private communities can only grow by invitation.
    setValues((v) => ({ ...v, visibility, joinPolicy: visibility === 'private' ? 'invite-only' : v.joinPolicy }));

  const pick = (which: 'avatar' | 'cover') => {
    const setImage = which === 'avatar' ? setAvatar : setCover;
    void pickImages('library', 1).then(([uri]) => {
      if (!uri) return;
      setImage((s) => ({ ...s, previewUrl: uri, uploading: true }));
      upload.mutate(uri, {
        onSuccess: (image) => setImage({ previewUrl: uri, key: image.key, uploading: false }),
        onError: (e) => {
          setImage((s) => ({ ...s, previewUrl: which === 'avatar' ? (initialImages?.avatarUrl ?? null) : (initialImages?.coverUrl ?? null), key: undefined, uploading: false }));
          setFormError(describeError(e));
        },
      });
    });
  };

  const submit = () => {
    const next = validateCommunity(values);
    setErrors(next);
    setFormError(null);
    if (next.name || next.description || next.category) return;
    const input: CommunityInput = {
      name: values.name.trim(),
      description: values.description.trim(),
      category: values.category!,
      visibility: values.visibility,
      joinPolicy: values.visibility === 'private' ? 'invite-only' : values.joinPolicy,
      ...(avatar.key !== undefined ? { avatarKey: avatar.key } : {}),
      ...(cover.key !== undefined ? { coverKey: cover.key } : {}),
    };
    onSubmit(input, {
      onError: (e) => {
        if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
        else if (e instanceof ApiError && e.serverCode === 'UNKNOWN_CATEGORY') setErrors({ category: describeError(e) });
        setFormError(`Not saved. ${describeError(e)}`);
      },
    });
  };

  const uploading = avatar.uploading || cover.uploading;

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <IconButton icon={X} label="Cancel" onPress={() => router.back()} />
        <Text variant="screenTitle" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Button label={submitLabel} size="small" loading={submitting} disabled={uploading} onPress={submit} style={styles.save} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]} keyboardShouldPersistTaps="handled">
        {formError ? <Banner tone="warning" message={formError} /> : null}

        <View style={styles.images}>
          <Pressable
            onPress={() => pick('cover')}
            style={styles.cover}
            accessibilityRole="button"
            accessibilityLabel={cover.previewUrl ? 'Change cover image' : 'Add a cover image'}
          >
            {cover.previewUrl ? <Image source={{ uri: cover.previewUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {cover.uploading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : cover.previewUrl ? null : (
              <View style={styles.coverHint}>
                <ImagePlus size={20} color={colors.textTertiary} strokeWidth={1.75} />
                <Text variant="meta" color="textTertiary">
                  Cover image
                </Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => pick('avatar')}
            style={styles.avatar}
            accessibilityRole="button"
            accessibilityLabel={avatar.previewUrl ? 'Change community photo' : 'Add a community photo'}
          >
            {avatar.previewUrl ? <Image source={{ uri: avatar.previewUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            {avatar.uploading ? <ActivityIndicator color={colors.onPrimary} /> : avatar.previewUrl ? null : <Camera size={22} color={colors.textTertiary} strokeWidth={1.75} />}
          </Pressable>
        </View>
        {avatar.previewUrl || cover.previewUrl ? (
          <View style={styles.removeRow}>
            {avatar.previewUrl && !avatar.uploading ? (
              <Button label="Remove photo" variant="text" subdued onPress={() => setAvatar({ previewUrl: null, key: null, uploading: false })} />
            ) : null}
            {cover.previewUrl && !cover.uploading ? (
              <Button label="Remove cover" variant="text" subdued onPress={() => setCover({ previewUrl: null, key: null, uploading: false })} />
            ) : null}
          </View>
        ) : null}
        <Text variant="meta" color="textTertiary">
          Images are public to anyone with their link, even for private communities.
        </Text>

        <TextField label="Name" value={values.name} onChangeText={(v) => set('name', v)} error={errors.name} maxLength={NAME_MAX} autoCapitalize="words" />
        <TextField
          label="Description"
          value={values.description}
          onChangeText={(v) => set('description', v)}
          error={errors.description}
          multiline
          maxLength={DESCRIPTION_MAX}
          helper={`${DESCRIPTION_MAX - values.description.length} characters left`}
        />

        <View style={styles.group}>
          <Text variant="label" color="textTertiary">
            Category
          </Text>
          {categories.isError ? (
            <ErrorState error={categories.error} onRetry={() => categories.refetch()} style={styles.inline} />
          ) : (
            <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Category">
              {(categories.data ?? []).map((c) => (
                <Chip key={c.slug} label={c.name} role="radio" selected={values.category === c.slug} onPress={() => set('category', c.slug)} />
              ))}
            </View>
          )}
          {errors.category ? (
            <Text variant="meta" color="warning">
              {errors.category}
            </Text>
          ) : null}
        </View>

        <View style={styles.group}>
          <Text variant="label" color="textTertiary">
            Who can see it
          </Text>
          <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Who can see it">
            {VISIBILITY.map((o) => (
              <Chip key={o.key} label={o.label} role="radio" selected={values.visibility === o.key} onPress={() => setVisibility(o.key)} />
            ))}
          </View>
          <Text variant="meta" color="textTertiary">
            {VISIBILITY.find((o) => o.key === values.visibility)?.help}
          </Text>
        </View>

        <View style={styles.group}>
          <Text variant="label" color="textTertiary">
            Who can join
          </Text>
          <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Who can join">
            {POLICIES.map((o) => (
              <Chip
                key={o.key}
                label={o.label}
                role="radio"
                selected={values.joinPolicy === o.key}
                disabled={values.visibility === 'private' && o.key !== 'invite-only'}
                onPress={() => set('joinPolicy', o.key)}
              />
            ))}
          </View>
          <Text variant="meta" color="textTertiary">
            {values.visibility === 'private' ? 'Private communities grow only by invitation.' : POLICIES.find((o) => o.key === values.joinPolicy)?.help}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, marginLeft: 4 },
  save: { marginRight: 10 },
  content: { padding: gutter, gap: space[5] },
  images: { paddingBottom: 28 },
  cover: {
    aspectRatio: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverHint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: {
    position: 'absolute',
    left: space[4],
    bottom: 0,
    width: 76,
    height: 76,
    borderRadius: communityRadius(76),
    backgroundColor: colors.surface3,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeRow: { flexDirection: 'row', gap: space[4], marginTop: -space[3] },
  group: { gap: space[3] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  inline: { paddingHorizontal: 0 },
});
