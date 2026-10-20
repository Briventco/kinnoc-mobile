import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { Profile, ProfileUpdate } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { Banner, CenteredSpinner, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { validateName } from '@/features/auth/validation';
import { useMe, useUpdateProfile } from '@/features/profile/hooks';
import { colors, fonts, gutter, radius, space } from '@/theme';

const MAX_INTERESTS = 8;

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
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);

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
      { ...form, displayName: form.displayName.trim(), website: form.website?.trim() || null },
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
    <KeyboardAvoidingView style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <Avatar name={form.displayName} uri={profile.avatarUrl} size={76} />
          {/* Photo upload depends on the media storage endpoint (POST /media). */}
          <Text variant="meta" color="textTertiary" style={styles.flex}>
            Profile photos can be added once photo upload is connected.
          </Text>
        </View>
        <TextField label="Name" value={form.displayName} onChangeText={(v) => setForm((f) => ({ ...f, displayName: v }))} error={errors.displayName} autoCapitalize="words" />
        <TextField label="Role or headline" value={form.headline ?? ''} onChangeText={set('headline')} placeholder="Student, designer, founder…" />
        <TextField label="Location" value={form.location ?? ''} onChangeText={set('location')} placeholder="City, country" />
        <TextField label="Bio" value={form.bio ?? ''} onChangeText={set('bio')} multiline maxLength={280} helper={`${280 - (form.bio?.length ?? 0)} characters left`} />
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, marginLeft: 4 },
  save: { marginRight: 10 },
  content: { padding: gutter, gap: space[5] },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
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
