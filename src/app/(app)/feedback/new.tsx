import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, CircleCheck, ImagePlus, Info, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, describeError } from '@/api/errors';
import type { FeedbackCategory, FeedbackDetail } from '@/api/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/Field';
import { IconButton } from '@/components/IconButton';
import { KeyboardAvoidingView } from '@/components/KeyboardAvoidingView';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { Banner } from '@/components/States';
import { Text } from '@/components/Text';
import { currentDevice } from '@/features/feedback/device';
import { useSubmitFeedback } from '@/features/feedback/hooks';
import {
  CATEGORY_COPY,
  characterCount,
  DESCRIPTION_MAX,
  describeDevice,
  FEEDBACK_CATEGORIES,
  isFeedbackCategory,
  MAX_ATTACHMENTS,
  SUBJECT_MAX,
  validateFeedback,
  type FeedbackField,
} from '@/features/feedback/model';
import { useMe } from '@/features/profile/hooks';
import { pickImages } from '@/lib/media';
import { KEYBOARD_BEHAVIOR } from '@/lib/useKeyboardVisible';
import { colors, gutter, radius, space } from '@/theme';

/** The feedback form. `?category=` preselects one of general, bug, feature or experience. */
export default function NewFeedback() {
  const params = useLocalSearchParams<{ category?: string }>();
  const insets = useSafeAreaInsets();
  const submit = useSubmitFeedback();
  const me = useMe();

  const [category, setCategory] = useState<FeedbackCategory | null>(isFeedbackCategory(params.category) ? params.category : null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  // Errors show for fields the user has left, and for every field after a send attempt.
  const [touched, setTouched] = useState<Partial<Record<FeedbackField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [discard, setDiscard] = useState(false);

  const draft = { category, subject, description, attachments };
  const errors = validateFeedback(draft);
  const serverFields = submit.error instanceof ApiError ? submit.error.fields : {};
  const fieldError = (field: FeedbackField) => ((attempted || touched[field]) && errors[field]) || serverFields[field] || null;
  const dirty = subject.trim().length > 0 || description.trim().length > 0 || attachments.length > 0;
  const busy = submit.isPending;
  const device = useMemo(() => currentDevice(), []);

  const close = () => (dirty && !busy && !submit.isSuccess ? setDiscard(true) : router.back());

  const addScreenshots = async (source: 'library' | 'camera') => {
    const uris = await pickImages(source, MAX_ATTACHMENTS - attachments.length);
    if (uris.length) setAttachments((a) => [...a, ...uris.filter((u) => !a.includes(u))].slice(0, MAX_ATTACHMENTS));
  };

  const send = () => {
    setAttempted(true);
    if (Object.keys(errors).length) return;
    submit.send(draft);
  };

  if (submit.isSuccess && submit.data) return <Sent feedback={submit.data} topInset={Platform.OS === 'android' ? insets.top : 0} />;

  const subjectCount = characterCount(subject, SUBJECT_MAX);
  const descriptionCount = characterCount(description, DESCRIPTION_MAX);
  const unavailable = submit.error instanceof ApiError && submit.error.code === 'unsupported';

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close" onPress={close} />
        <Text variant="screenTitle" style={styles.title} accessibilityRole="header">
          Send feedback
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR} keyboardVerticalOffset={Platform.OS === 'ios' ? 56 : 0}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, space[4]) + space[4] }]} keyboardShouldPersistTaps="handled">
          {submit.error && !busy ? (
            <Banner
              tone={unavailable ? 'info' : 'warning'}
              message={unavailable ? describeError(submit.error) : `Your feedback wasn't sent. ${describeError(submit.error)}`}
            />
          ) : null}

          <View style={styles.group}>
            <Text variant="label" color="textTertiary" nativeID="feedback-category-label">
              What&apos;s it about?
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabelledBy="feedback-category-label">
              {FEEDBACK_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={CATEGORY_COPY[c].short}
                  role="radio"
                  selected={category === c}
                  disabled={busy}
                  onPress={() => {
                    setCategory(c);
                    setTouched((t) => ({ ...t, category: true }));
                  }}
                />
              ))}
            </View>
            {fieldError('category') ? (
              <Text variant="meta" color="warning" accessibilityLiveRegion="polite">
                {fieldError('category')}
              </Text>
            ) : null}
          </View>

          <TextField
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            onBlur={() => setTouched((t) => ({ ...t, subject: true }))}
            placeholder="A short summary"
            maxLength={SUBJECT_MAX}
            editable={!busy}
            returnKeyType="next"
            error={fieldError('subject')}
            helper={subjectCount.text}
            testID="feedback-subject"
          />

          <View style={styles.group}>
            <TextField
              label="Details"
              value={description}
              onChangeText={setDescription}
              onBlur={() => setTouched((t) => ({ ...t, description: true }))}
              placeholder={category ? CATEGORY_COPY[category].placeholder : 'Tell us as much as you can.'}
              multiline
              maxLength={DESCRIPTION_MAX}
              editable={!busy}
              error={fieldError('description')}
              testID="feedback-description"
            />
            {!fieldError('description') ? (
              <Text variant="meta" color={descriptionCount.over ? 'warning' : 'textTertiary'} style={styles.counter}>
                {descriptionCount.text}
              </Text>
            ) : null}
          </View>

          <View style={styles.group}>
            <Text variant="label" color="textTertiary">
              Screenshots (optional)
            </Text>
            {attachments.length ? (
              <View style={styles.thumbs}>
                {attachments.map((uri, i) => (
                  <View key={uri} style={styles.thumbWrap}>
                    <Image source={{ uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={`Screenshot ${i + 1}`} />
                    {busy ? null : (
                      <Pressable
                        onPress={() => setAttachments((a) => a.filter((u) => u !== uri))}
                        style={styles.remove}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove screenshot ${i + 1}`}
                        hitSlop={8}
                      >
                        <X size={14} color={colors.onPrimary} strokeWidth={2.5} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.attachRow}>
              <Button
                variant="quiet"
                size="small"
                icon={ImagePlus}
                label={attachments.length ? 'Add another' : 'Add screenshot'}
                disabled={busy || attachments.length >= MAX_ATTACHMENTS}
                onPress={() => void addScreenshots('library')}
              />
              {Platform.OS !== 'web' ? (
                <IconButton icon={Camera} label="Take a photo" color="textSecondary" disabled={busy || attachments.length >= MAX_ATTACHMENTS} onPress={() => void addScreenshots('camera')} />
              ) : null}
            </View>
            <Text variant="meta" color={fieldError('attachments') ? 'warning' : 'textTertiary'}>
              {fieldError('attachments') ?? `Up to ${MAX_ATTACHMENTS} images. Only you and the Kinnoc team can see them.`}
            </Text>
          </View>

          {category === 'bug' ? (
            <View style={styles.note} accessibilityRole="text">
              <Info size={18} color={colors.textSecondary} strokeWidth={2} />
              <Text variant="preview" color="textSecondary" style={styles.flex}>
                To help us fix it, we&apos;ll include {describeDevice(device)}.
              </Text>
            </View>
          ) : null}

          <Text variant="meta" color="textTertiary">
            {me.data ? `Sent from your account, @${me.data.username}. ` : ''}We&apos;ll reply here in Kinnoc and send you a notification.
          </Text>

          <Button
            label={submit.stage === 'uploading' ? 'Uploading screenshots…' : 'Send feedback'}
            size="large"
            fullWidth
            loading={busy}
            disabled={busy}
            onPress={send}
            accessibilityHint="Sends your feedback to the Kinnoc team"
          />
          {busy ? (
            <Text variant="meta" color="textTertiary" style={styles.center} accessibilityLiveRegion="polite">
              {submit.stage === 'uploading' ? 'Uploading screenshots…' : 'Sending…'}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={discard}
        title="Discard this feedback?"
        body="What you've written will be lost."
        confirmLabel="Discard"
        destructive
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          router.back();
        }}
      />
    </View>
  );
}

/** Confirmation once the submission is saved, with the way to follow it. */
function Sent({ feedback, topInset }: { feedback: FeedbackDetail; topInset: number }) {
  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
      </View>
      <View style={styles.sent} accessibilityLiveRegion="polite">
        <View style={styles.sentIcon}>
          <CircleCheck size={32} color={colors.success} strokeWidth={2} />
        </View>
        <Text variant="pageTitle" accessibilityRole="header" style={styles.center}>
          Thanks, we&apos;ve got it
        </Text>
        <Text variant="post" color="textSecondary" style={styles.center}>
          We read every submission. You&apos;ll get a notification when the Kinnoc team replies.
        </Text>
        <View style={styles.sentActions}>
          <Button label="View your feedback" size="large" fullWidth onPress={() => router.replace(`/feedback/${feedback.id}`)} />
          <Button label="Done" variant="text" subdued onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  flex: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, marginLeft: 4 },
  content: { padding: gutter, gap: space[5] },
  group: { gap: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  counter: { textAlign: 'right' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  thumbWrap: { width: 76, height: 76 },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md, backgroundColor: colors.surface3 },
  remove: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], padding: space[3], borderRadius: radius.md, backgroundColor: colors.surface2 },
  center: { textAlign: 'center' },
  sent: { flex: 1, paddingHorizontal: space[6], paddingTop: space[8], alignItems: 'center', gap: space[3] },
  sentIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  sentActions: { alignSelf: 'stretch', gap: space[2], marginTop: space[4], alignItems: 'center' },
});
