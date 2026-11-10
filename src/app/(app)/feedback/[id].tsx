import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock3, MessageSquareHeart } from 'lucide-react-native';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import type { FeedbackDetail } from '@/api/types';
import { AutolinkText } from '@/components/AutolinkText';
import { ScreenHeader } from '@/components/Header';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { CATEGORY_ICON, StatusPill } from '@/features/feedback/FeedbackParts';
import { useFeedback } from '@/features/feedback/hooks';
import { CATEGORY_COPY, describeDevice, STATUS_COPY } from '@/features/feedback/model';
import { formatDayTime } from '@/lib/format';
import { openExternal } from '@/lib/links';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { colors, gutter, radius, space } from '@/theme';

/**
 * One of the viewer's own submissions and the Kinnoc team's replies. Opened from the history and
 * from "The Kinnoc team replied" notifications (`/feedback/<id>`).
 */
export default function FeedbackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const feedback = useFeedback(id);
  const pull = usePullToRefresh(feedback.refetch);

  // Someone else's submission, or one that no longer exists: the API answers the same for both.
  const gone = feedback.error instanceof ApiError && (feedback.error.code === 'not_found' || feedback.error.code === 'forbidden');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Feedback" />
      {feedback.isPending ? (
        <CenteredSpinner />
      ) : gone ? (
        <EmptyState
          title="This feedback isn't available"
          body="You can only open feedback you sent. It may also have been removed."
          illustration={false}
          action={{ label: 'Your feedback', onPress: () => router.replace('/feedback/history') }}
        />
      ) : feedback.isError ? (
        <ErrorState error={feedback.error} onRetry={() => feedback.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl {...pull} tintColor={colors.textTertiary} />}>
          <Submission feedback={feedback.data} />
          <Replies feedback={feedback.data} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Submission({ feedback }: { feedback: FeedbackDetail }) {
  const Icon = CATEGORY_ICON[feedback.category];
  return (
    <View style={styles.section}>
      <View style={styles.metaRow}>
        <View style={styles.category}>
          <Icon size={16} color={colors.textSecondary} strokeWidth={2} />
          <Text variant="meta" color="textSecondary">
            {CATEGORY_COPY[feedback.category].title}
          </Text>
        </View>
        <StatusPill status={feedback.status} />
      </View>
      <Text variant="headline" accessibilityRole="header">
        {feedback.subject}
      </Text>
      <Text variant="meta" color="textTertiary">
        Sent {formatDayTime(feedback.createdAt)}
      </Text>
      <View style={styles.statusNote}>
        <Text variant="preview" color="textSecondary">
          {STATUS_COPY[feedback.status].explanation}
        </Text>
      </View>
      <AutolinkText variant="post" style={styles.body}>
        {feedback.description}
      </AutolinkText>

      {feedback.attachments.length ? (
        <View style={styles.thumbs}>
          {feedback.attachments.map((a, i) =>
            a.url && a.mimeType.startsWith('image/') ? (
              <Pressable
                key={a.key}
                onPress={() => void openExternal(a.url!)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Screenshot ${i + 1}. Open full size`}
              >
                <Image source={{ uri: a.url }} style={styles.thumb} contentFit="cover" />
              </Pressable>
            ) : (
              <View key={a.key} style={[styles.thumb, styles.thumbMissing]} accessibilityLabel={`Attachment ${i + 1} can't be shown`}>
                <Text variant="meta" color="textTertiary">
                  {a.mimeType === 'application/pdf' ? 'PDF' : 'File'}
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}

      {feedback.device ? (
        <Text variant="meta" color="textTertiary">
          Sent with {describeDevice(feedback.device)}
        </Text>
      ) : null}
    </View>
  );
}

/** Replies from the Kinnoc team only. Internal notes never reach the app. */
function Replies({ feedback }: { feedback: FeedbackDetail }) {
  return (
    <View style={[styles.section, styles.replies]}>
      <Text variant="label" color="textTertiary" accessibilityRole="header">
        Replies from the Kinnoc team
      </Text>
      {feedback.responses.length ? (
        feedback.responses.map((r) => (
          <View key={r.id} style={styles.reply} testID="feedback-response">
            <View style={styles.replyHead}>
              <View style={styles.teamMark}>
                <MessageSquareHeart size={16} color={colors.onPrimary} strokeWidth={2} />
              </View>
              <Text variant="name">Kinnoc team</Text>
              <Text variant="meta" color="textTertiary" style={styles.replyDate}>
                {formatDayTime(r.createdAt)}
              </Text>
            </View>
            <AutolinkText variant="message">{r.body}</AutolinkText>
          </View>
        ))
      ) : (
        <View style={styles.noReply}>
          <Clock3 size={18} color={colors.textTertiary} strokeWidth={2} />
          <Text variant="preview" color="textSecondary" style={styles.flex}>
            No reply yet. You&apos;ll get a notification when the Kinnoc team replies.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { paddingBottom: space[8] },
  section: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[2] },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  category: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statusNote: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: colors.surface2 },
  body: { marginTop: space[1] },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[1] },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface3 },
  thumbMissing: { alignItems: 'center', justifyContent: 'center' },
  replies: { marginTop: space[4], borderTopWidth: 1, borderTopColor: colors.border },
  reply: { gap: space[2], padding: space[3], borderRadius: radius.feature, backgroundColor: colors.bubbleIncoming },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  replyDate: { marginLeft: 'auto' },
  teamMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brandNavy, alignItems: 'center', justifyContent: 'center' },
  noReply: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingVertical: space[2] },
});
