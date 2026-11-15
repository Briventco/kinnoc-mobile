import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Camera, Megaphone, MessagesSquare, Shield, Sparkles, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { CommunityGroupInput, GroupJoinPolicy } from '@/api/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { pickImages } from '@/lib/media';
import { KEYBOARD_BEHAVIOR } from '@/lib/useKeyboardVisible';
import { colors, communityRadius, gutter, radius, space } from '@/theme';

import type { GroupIconName } from './GroupRow';
import { useUploadCommunityImage } from './hooks';

export const GROUP_NAME_MIN = 2;
export const GROUP_NAME_MAX = 80;
export const GROUP_DESCRIPTION_MAX = 500;

export interface GroupFormValues {
  name: string;
  description: string;
  joinPolicy: GroupJoinPolicy;
  iconName: GroupIconName;
}

const POLICIES: { key: GroupJoinPolicy; label: string; help: string }[] = [
  { key: 'open', label: 'Open', help: 'Any member of this community can join.' },
  { key: 'invite-only', label: 'Invite only', help: 'Admins add members directly.' },
];

const ICONS: { key: GroupIconName; label: string; Icon: typeof Users }[] = [
  { key: 'users', label: 'Team', Icon: Users },
  { key: 'messages-square', label: 'Discussion', Icon: MessagesSquare },
  { key: 'megaphone', label: 'Announcements', Icon: Megaphone },
  { key: 'shield', label: 'Organisers', Icon: Shield },
  { key: 'sparkles', label: 'Special', Icon: Sparkles },
];

export function validateGroup(v: GroupFormValues) {
  const name = v.name.trim();
  const description = v.description.trim();
  return {
    name: !name
      ? 'Give this group a name.'
      : name.length < GROUP_NAME_MIN
        ? `Use at least ${GROUP_NAME_MIN} characters.`
        : name.length > GROUP_NAME_MAX
          ? `Keep it under ${GROUP_NAME_MAX} characters.`
          : null,
    description:
      description.length > GROUP_DESCRIPTION_MAX
        ? `Keep it under ${GROUP_DESCRIPTION_MAX} characters.`
        : null,
  };
}

interface GroupFormProps {
  title: string;
  submitLabel: string;
  initial: GroupFormValues;
  initialAvatarUrl?: string | null;
  submitting: boolean;
  onSubmit: (input: CommunityGroupInput, done: { onError: (e: unknown) => void }) => void;
}

export function GroupForm({
  title,
  submitLabel,
  initial,
  initialAvatarUrl = null,
  submitting,
  onSubmit,
}: GroupFormProps) {
  const insets = useSafeAreaInsets();
  const upload = useUploadCommunityImage();
  const [values, setValues] = useState<GroupFormValues>(initial);
  const [errors, setErrors] = useState<{ name?: string | null; description?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{ previewUrl: string | null; key: string | null | undefined; uploading: boolean }>({
    previewUrl: initialAvatarUrl,
    key: undefined,
    uploading: false,
  });

  const set = <K extends keyof GroupFormValues>(key: K, value: GroupFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key === 'name') {
      setErrors((prev) => (prev.name ? { ...prev, name: null } : prev));
    } else if (key === 'description') {
      setErrors((prev) => (prev.description ? { ...prev, description: null } : prev));
    }
    setFormError(null);
  };

  const pickAvatar = async () => {
    const [uri] = await pickImages('library', 1);
    if (!uri) return;
    setAvatar({ previewUrl: uri, key: undefined, uploading: true });
    upload.mutate(uri, {
      onSuccess: (uploaded) => setAvatar({ previewUrl: uploaded.url, key: uploaded.key, uploading: false }),
      onError: (e) => {
        setAvatar({ previewUrl: initialAvatarUrl, key: undefined, uploading: false });
        setFormError(describeError(e));
      },
    });
  };

  const submit = () => {
    const nextErrors = validateGroup(values);
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.description) return;
    if (avatar.uploading) {
      setFormError('Wait for the group photo to finish uploading.');
      return;
    }

    onSubmit(
      {
        name: values.name.trim(),
        description: values.description.trim(),
        joinPolicy: values.joinPolicy,
        iconName: values.iconName,
        ...(avatar.key !== undefined ? { avatarKey: avatar.key } : {}),
      },
      {
        onError: (e) => {
          setFormError(e instanceof ApiError ? describeError(e) : "Couldn't save group.");
        },
      },
    );
  };

  const selectedPolicy = POLICIES.find((p) => p.key === values.joinPolicy);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
        <Text variant="section" style={styles.headerTitle}>
          {title}
        </Text>
        <Button label={submitLabel} size="small" loading={submitting} disabled={avatar.uploading} onPress={submit} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space[8] }]} keyboardShouldPersistTaps="handled">
          {formError ? <Banner tone="warning" message={formError} /> : null}

          <View style={styles.avatarRow}>
            <Pressable
              onPress={() => void pickAvatar()}
              style={styles.avatarPicker}
              accessibilityRole="button"
              accessibilityLabel="Choose group photo"
            >
              {avatar.previewUrl ? (
                <Image source={{ uri: avatar.previewUrl }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <Camera size={24} color={colors.textTertiary} strokeWidth={1.75} />
              )}
              {avatar.uploading ? (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator color={colors.onPrimary} />
                </View>
              ) : null}
            </Pressable>
            <View style={styles.flex}>
              <Text variant="label">Group photo (optional)</Text>
              <Text variant="meta" color="textTertiary">
                Upload a custom image or pick an icon below.
              </Text>
              {avatar.previewUrl ? (
                <Button
                  label="Remove photo"
                  variant="text"
                  size="small"
                  onPress={() => setAvatar({ previewUrl: null, key: null, uploading: false })}
                  style={styles.removePhoto}
                />
              ) : null}
            </View>
          </View>

          <TextField
            label="Group name"
            value={values.name}
            onChangeText={(v) => set('name', v)}
            error={errors.name}
            placeholder="e.g. Organising Team"
            maxLength={GROUP_NAME_MAX}
          />

          <TextField
            label="Description"
            value={values.description}
            onChangeText={(v) => set('description', v)}
            error={errors.description}
            placeholder="What happens in this group?"
            multiline
            maxLength={GROUP_DESCRIPTION_MAX}
          />

          <View style={styles.fieldGroup}>
            <Text variant="label">Icon</Text>
            <View style={styles.chips}>
              {ICONS.map(({ key, label, Icon }) => {
                const selected = values.iconName === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => set('iconName', key)}
                    style={[styles.iconOption, selected && styles.iconOptionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Icon size={16} color={selected ? colors.primary : colors.textSecondary} strokeWidth={2} />
                    <Text variant="meta" color={selected ? 'primary' : 'textSecondary'}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text variant="label">Who can join</Text>
            <View style={styles.chips}>
              {POLICIES.map((p) => (
                <Chip
                  key={p.key}
                  label={p.label}
                  selected={values.joinPolicy === p.key}
                  onPress={() => set('joinPolicy', p.key)}
                />
              ))}
            </View>
            {selectedPolicy ? (
              <Text variant="meta" color="textTertiary">
                {selectedPolicy.help}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  content: { padding: gutter, gap: space[5] },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  avatarPicker: {
    width: 72,
    height: 72,
    borderRadius: communityRadius(72),
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhoto: { alignSelf: 'flex-start', marginTop: space[1] },
  fieldGroup: { gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  iconOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primarySubtleStrong,
  },
});
