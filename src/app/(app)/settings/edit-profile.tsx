import { router } from 'expo-router';
import { Camera, Check, ImagePlus, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Profile, ProfileUpdate } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { ActionSheet, ConfirmDialog, type SheetAction } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Banner, CenteredSpinner, ErrorState, SkeletonBlock } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { validateName } from '@/features/auth/validation';
import { useCategories } from '@/features/communities/hooks';
import { useMe, useRemoveAvatar, useSetAvatar, useUpdateProfile } from '@/features/profile/hooks';
import { pickSquareImage } from '@/lib/media';
import { api } from '@/services';
import { KEYBOARD_BEHAVIOR } from '@/lib/useKeyboardVisible';
import { colors, fonts, gutter, radius, space } from '@/theme';

const MAX_INTERESTS = 8;
/** The API keeps at most 20 interests per person. */
const MAX_CATALOGUE_INTERESTS = 20;

export default function EditProfile() {
  const me = useMe();
  if (me.isPending) return <CenteredSpinner />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  return <EditForm profile={me.data} />;
}

function EditForm({ profile }: { profile: Profile }) {
  const insets = useSafeAreaInsets();
  const update = useUpdateProfile();
  const toast = useToast();
  const [form, setForm] = useState<ProfileUpdate>({
    displayName: profile.displayName,
    headline: profile.headline,
    location: profile.location,
    bio: profile.bio,
    website: profile.website,
    interests: profile.interests,
  });
  const [interest, setInterest] = useState('');
  /** Headline, location, website and free-text interests are only kept by backends that support them. */
  const details = api.capabilities.profileDetails;
  /** Interests picked from the backend's catalogue, by slug. */
  const catalogue = api.capabilities.interestCatalogue;
  const [picked, setPicked] = useState(profile.interestSlugs);
  const interestsChanged = picked.length !== profile.interestSlugs.length || picked.some((s) => !profile.interestSlugs.includes(s));
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const setAvatar = useSetAvatar();
  const removeAvatar = useRemoveAvatar();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const photoBusy = setAvatar.isPending || removeAvatar.isPending;
  // While uploading, show the picked image; the saved photo arrives with the updated profile.
  const photoUri = setAvatar.isPending ? setAvatar.variables : profile.avatarUrl;

  const choosePhoto = async (source: 'library' | 'camera') => {
    if (photoBusy) return;
    const uri = await pickSquareImage(source);
    if (!uri) return;
    setFormError(null);
    setAvatar.mutate(uri, {
      onSuccess: () => toast.show({ message: 'Profile photo updated' }),
      onError: (e) => setFormError(`Your photo wasn't saved. ${describeError(e)}`),
    });
  };

  const deletePhoto = () => {
    setFormError(null);
    removeAvatar.mutate(undefined, {
      onSuccess: () => {
        setConfirmRemove(false);
        toast.show({ message: 'Profile photo removed' });
      },
      onError: (e) => {
        setConfirmRemove(false);
        setFormError(`Your photo wasn't removed. ${describeError(e)}`);
      },
    });
  };

  const photoActions: SheetAction[] = [
    { label: 'Choose from library', icon: ImagePlus, onPress: () => void choosePhoto('library') },
    { label: 'Take photo', icon: Camera, onPress: () => void choosePhoto('camera') },
    ...(profile.avatarUrl ? [{ label: 'Remove photo', icon: Trash2, destructive: true, onPress: () => setConfirmRemove(true) }] : []),
  ];

  const set = (key: keyof ProfileUpdate) => (value: string) => setForm((f) => ({ ...f, [key]: value || null }));

  const addInterest = () => {
    const v = interest.trim();
    if (!v || form.interests.includes(v) || form.interests.length >= MAX_INTERESTS) return;
    setForm((f) => ({ ...f, interests: [...f.interests, v] }));
    setInterest('');
  };

  const save = () => {
    const nameError = validateName(form.displayName ?? '');
    const websiteError = form.website && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(form.website.trim()) ? 'Enter a web address like brivent.co.' : null;
    setErrors({ displayName: nameError, website: websiteError });
    setFormError(null);
    if (nameError || websiteError) return;
    update.mutate(
      {
        ...form,
        displayName: form.displayName.trim(),
        website: form.website?.trim() || null,
        interestSlugs: catalogue && interestsChanged ? picked : undefined,
      },
      {
        onSuccess: () => {
          toast.show({ message: 'Profile updated' });
          router.back();
        },
        onError: (e) => {
          if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
          setFormError(`Your changes weren't saved. ${describeError(e)}`);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]} behavior={KEYBOARD_BEHAVIOR}>
      <View style={styles.header}>
        <IconButton icon={X} label="Cancel" onPress={() => router.back()} />
        <Text variant="screenTitle" style={styles.title} accessibilityRole="header">
          Edit profile
        </Text>
        <Button label="Save" size="small" loading={update.isPending} onPress={save} style={styles.save} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]} keyboardShouldPersistTaps="handled">
        {formError ? <Banner tone="warning" message={formError} /> : null}
        <View style={styles.avatarRow}>
          <Pressable
            onPress={() => setPhotoSheet(true)}
            disabled={photoBusy}
            accessibilityRole="button"
            accessibilityLabel={profile.avatarUrl ? 'Change profile photo' : 'Add profile photo'}
            accessibilityState={{ busy: photoBusy, disabled: photoBusy }}
          >
            <Avatar name={form.displayName} uri={photoUri} size={76} />
            {photoBusy ? (
              <View style={styles.photoBusy}>
                <ActivityIndicator color={colors.onPrimary} accessibilityLabel="Saving photo" />
              </View>
            ) : null}
          </Pressable>
          <View style={styles.flex}>
            <Button
              label={profile.avatarUrl ? 'Change photo' : 'Add photo'}
              variant="text"
              onPress={() => setPhotoSheet(true)}
              disabled={photoBusy}
              style={styles.photoButton}
            />
            <Text variant="meta" color="textTertiary">
              JPEG, PNG or HEIC. It’s cropped square and shown to everyone.
            </Text>
          </View>
        </View>
        <TextField label="Name" value={form.displayName} onChangeText={(v) => setForm((f) => ({ ...f, displayName: v }))} error={errors.displayName} autoCapitalize="words" />
        {details ? (
          <>
            <TextField label="Role or headline" value={form.headline ?? ''} onChangeText={set('headline')} placeholder="Student, designer, founder…" />
            <TextField label="Location" value={form.location ?? ''} onChangeText={set('location')} placeholder="City, country" />
          </>
        ) : null}
        <TextField label="Bio" value={form.bio ?? ''} onChangeText={set('bio')} multiline maxLength={280} helper={`${280 - (form.bio?.length ?? 0)} characters left`} />
        {catalogue ? <InterestPicker picked={picked} onChange={setPicked} /> : null}
        {details ? (
          <>
            <TextField
              label="Website"
              value={form.website ?? ''}
              onChangeText={set('website')}
              error={errors.website}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="yoursite.com"
            />
            <View style={styles.interests}>
              <Text variant="label" color="textTertiary">
                Interests
              </Text>
              <View style={styles.tags}>
                {form.interests.map((i) => (
                  <Pressable
                    key={i}
                    onPress={() => setForm((f) => ({ ...f, interests: f.interests.filter((x) => x !== i) }))}
                    style={styles.tag}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${i}`}
                  >
                    <Text variant="name" style={styles.tagText}>
                      {i}
                    </Text>
                    <X size={14} color={colors.textTertiary} strokeWidth={2} />
                  </Pressable>
                ))}
              </View>
              {form.interests.length < MAX_INTERESTS ? (
                <View style={styles.addRow}>
                  <TextInput
                    value={interest}
                    onChangeText={setInterest}
                    placeholder="Add an interest"
                    placeholderTextColor={colors.textTertiary}
                    onSubmitEditing={addInterest}
                    returnKeyType="done"
                    style={styles.addInput}
                    accessibilityLabel="Add an interest"
                    maxLength={32}
                  />
                  <Button label="Add" variant="quiet" size="small" onPress={addInterest} disabled={!interest.trim()} />
                </View>
              ) : (
                <Text variant="meta" color="textTertiary">
                  You can add up to {MAX_INTERESTS} interests.
                </Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
      <ActionSheet visible={photoSheet} title="Profile photo" actions={photoActions} onClose={() => setPhotoSheet(false)} />
      <ConfirmDialog
        visible={confirmRemove}
        title="Remove your photo?"
        body="People will see your initials instead."
        confirmLabel="Remove"
        destructive
        loading={removeAvatar.isPending}
        onConfirm={deletePhoto}
        onCancel={() => setConfirmRemove(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** Interests from the API's catalogue, as toggles. Saved with the rest of the form. */
function InterestPicker({ picked, onChange }: { picked: string[]; onChange: (slugs: string[]) => void }) {
  const options = useCategories();
  const full = picked.length >= MAX_CATALOGUE_INTERESTS;
  const toggle = (slug: string) => onChange(picked.includes(slug) ? picked.filter((s) => s !== slug) : full ? picked : [...picked, slug]);

  return (
    <View style={styles.interests}>
      <Text variant="label" color="textTertiary">
        Interests
      </Text>
      {options.isPending ? (
        <View style={styles.tags} accessible accessibilityLabel="Loading interests" accessibilityRole="progressbar">
          {[88, 120, 72, 104, 96].map((w) => (
            <SkeletonBlock key={w} style={{ width: w, height: 36, borderRadius: radius.tag }} />
          ))}
        </View>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => options.refetch()} style={styles.pickerError} />
      ) : (
        <>
          <View style={styles.tags}>
            {options.data.map((c) => {
              const on = picked.includes(c.slug);
              return (
                <Pressable
                  key={c.slug}
                  onPress={() => toggle(c.slug)}
                  disabled={!on && full}
                  style={[styles.tag, on && styles.tagOn]}
                  accessibilityRole="checkbox"
                  accessibilityLabel={c.name}
                  accessibilityState={{ checked: on, disabled: !on && full }}
                >
                  {on ? <Check size={14} color={colors.primary} strokeWidth={2.5} /> : null}
                  <Text variant="name" color={on ? 'primary' : !on && full ? 'textTertiary' : 'text'} style={styles.tagText}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="meta" color="textTertiary">
            {full ? `That's the most you can pick (${MAX_CATALOGUE_INTERESTS}).` : picked.length ? `${picked.length} picked. People see these on your profile.` : 'Pick what you’re into. You can leave this empty.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tagOn: { borderColor: colors.primarySubtleStrong, backgroundColor: colors.primarySubtle },
  pickerError: { marginHorizontal: 0 },
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, marginLeft: 4 },
  save: { marginRight: 10 },
  content: { padding: gutter, gap: space[5] },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  photoBusy: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 38, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  photoButton: { alignSelf: 'flex-start' },
  interests: { gap: space[3] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.tag, paddingHorizontal: 12, minHeight: 36 },
  tagText: { fontSize: 14 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  addInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.field,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    fontFamily: fonts.body400,
    fontSize: 16,
    color: colors.text,
  },
});
