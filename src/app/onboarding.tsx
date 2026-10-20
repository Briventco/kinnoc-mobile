import { ChevronLeft } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityAvatar, OrgMonogram } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Emoji } from '@/components/Emoji';
import { Pressable } from '@/components/Pressable';
import { Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { colors, radius, space, type } from '@/theme';

interface Step {
  title: string;
  body: string;
  preview: ReactNode;
}

/* Illustrations of the product built from real components. They show no counts or claims. */

function CommunitiesPreview() {
  const rows = [
    { id: 'c_tech', name: 'Tech Creators', monogram: 'TC', topic: 'Developers and makers', joined: true },
    { id: 'c_design', name: 'Design Hub', monogram: 'DH', topic: 'Product and UI design', joined: false },
    { id: 'c_uniosun', name: 'UNIOSUN Community', monogram: 'U', topic: 'Campus life and study help', joined: false },
  ];
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.id}>
          <View style={styles.previewRow}>
            <CommunityAvatar id={r.id} monogram={r.monogram} size={44} />
            <View style={styles.flex}>
              <Text variant="rowTitle" numberOfLines={1}>
                {r.name}
              </Text>
              <Text variant="preview" color="textTertiary" numberOfLines={1}>
                {r.topic}
              </Text>
            </View>
            <View style={[styles.joinChip, r.joined && styles.joinedChip]}>
              <Text variant="button" color={r.joined ? 'textTertiary' : 'primary'}>
                {r.joined ? 'Joined' : 'Join'}
              </Text>
            </View>
          </View>
          {i < rows.length - 1 ? <Hairline inset={56} /> : null}
        </View>
      ))}
    </View>
  );
}

function ConversationPreview() {
  return (
    <View style={styles.chat}>
      <Text variant="meta" color="textTertiary">
        <Text variant="name" style={styles.sender}>
          Tovia O.
        </Text>{' '}
        10:28 AM
      </Text>
      <View style={[styles.bubble, styles.incoming]}>
        <Text variant="message">The section on user research was my favourite.</Text>
      </View>
      <View style={styles.reactions}>
        <View style={styles.reaction}>
          <Emoji>👍</Emoji>
          <Text variant="meta">4</Text>
        </View>
        <View style={[styles.reaction, styles.reactionMine]}>
          <Emoji>🙌</Emoji>
          <Text variant="meta" color="brandNavy">
            6
          </Text>
        </View>
      </View>
      <View style={[styles.bubble, styles.outgoing]}>
        <Text variant="message" color="onPrimary">
          Agreed! Turning insights into decisions.
        </Text>
      </View>
      <Text variant="meta" color="textTertiary" style={styles.readLine}>
        10:32 AM · Read
      </Text>
    </View>
  );
}

function OpportunitiesPreview() {
  return (
    <View>
      <View style={styles.previewRow}>
        <View style={styles.stamp}>
          <Text variant="label" color="primary">
            Oct
          </Text>
          <Text variant="numeral">24</Text>
        </View>
        <View style={styles.flex}>
          <Text variant="label" color="textTertiary">
            Event
          </Text>
          <Text variant="rowTitle">Lagos Tech Meetup</Text>
        </View>
      </View>
      <Hairline inset={56} />
      <View style={styles.previewRow}>
        <OrgMonogram id="org_b" monogram="B" />
        <View style={styles.flex}>
          <Text variant="label" color="textTertiary">
            Internship · Closes 15 Nov
          </Text>
          <Text variant="rowTitle">Frontend Developer (Internship)</Text>
        </View>
      </View>
      <Hairline inset={56} />
      <View style={styles.previewRow}>
        <View style={styles.cover}>
          <Text style={styles.coverText} color="onPrimary">
            SD
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="label" color="textTertiary">
            Guide · 12 min read
          </Text>
          <Text variant="rowTitle">System Design Roadmap</Text>
        </View>
      </View>
    </View>
  );
}

const STEPS: Step[] = [
  {
    title: 'Find your people.',
    body: 'Join communities for your campus, your craft and the things you care about.',
    preview: <CommunitiesPreview />,
  },
  {
    title: 'Join the conversation.',
    body: 'Each community has one group chat. Ask questions, share work and react to replies.',
    preview: <ConversationPreview />,
  },
  {
    title: "Discover what's next.",
    body: 'Events, internships, scholarships and guides, picked for your interests.',
    preview: <OpportunitiesPreview />,
  },
];

export default function Onboarding() {
  const { complete } = useOnboarding();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <View style={styles.progress} accessible accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.segment, i <= index && styles.segmentOn]} />
          ))}
        </View>
        <Pressable onPress={complete} accessibilityRole="button" accessibilityLabel="Skip introduction" hitSlop={12}>
          <Text variant="button" color="textSecondary">
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} key={index}>
        <Text style={styles.title} accessibilityRole="header">
          {step.title}
        </Text>
        <Text variant="post" color="textSecondary" style={styles.body}>
          {step.body}
        </Text>
        <View style={styles.preview} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {step.preview}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {index > 0 ? (
          <Pressable
            onPress={() => setIndex((i) => i - 1)}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <ChevronLeft size={24} color={colors.text} strokeWidth={1.75} />
          </Pressable>
        ) : null}
        <Button
          label={last ? 'Get started' : 'Next'}
          size="large"
          onPress={() => (last ? complete() : setIndex((i) => i + 1))}
          style={styles.flex}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[5], paddingHorizontal: space[6], paddingTop: space[4] },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surface3 },
  segmentOn: { backgroundColor: colors.text },
  content: { paddingHorizontal: space[6], paddingTop: space[8], paddingBottom: space[6] },
  title: { ...type.hero, fontSize: 38, lineHeight: 42, color: colors.text },
  body: { marginTop: space[3] },
  preview: { marginTop: 56 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 14 },
  joinChip: { height: 34, paddingHorizontal: 14, borderRadius: radius.field, backgroundColor: colors.primarySubtle, justifyContent: 'center' },
  joinedChip: { backgroundColor: colors.surface },
  stamp: { width: 44, alignItems: 'center' },
  cover: {
    width: 44,
    height: 56,
    borderRadius: radius.tag,
    backgroundColor: colors.brandNavy,
    justifyContent: 'flex-end',
    padding: 5,
  },
  coverText: { ...type.featured, fontSize: 15, lineHeight: 17 },
  chat: { gap: 6 },
  sender: { fontSize: 13 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.bubble, maxWidth: '86%' },
  incoming: { backgroundColor: colors.bubbleIncoming, borderTopLeftRadius: radius.tail, alignSelf: 'flex-start' },
  outgoing: { backgroundColor: colors.bubbleOutgoing, borderTopRightRadius: radius.tail, alignSelf: 'flex-end', marginTop: space[3] },
  reactions: { flexDirection: 'row', gap: 6 },
  reaction: { height: 28, paddingHorizontal: 8, borderRadius: radius.tag, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  reactionMine: { backgroundColor: colors.primarySubtle, borderWidth: 1, borderColor: colors.primarySubtleStrong },
  readLine: { alignSelf: 'flex-end' },
  actions: { flexDirection: 'row', gap: space[3], paddingHorizontal: space[6], paddingBottom: space[4] },
  back: { width: 64, height: 52, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
