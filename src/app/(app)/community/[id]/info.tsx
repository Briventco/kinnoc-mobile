import { router, useLocalSearchParams } from 'expo-router';
import { Bell, BellOff, Globe, Lock, MessageSquareText, Pin } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useCommunity, useInbox, useInboxActions, useJoinCommunity, useLeaveCommunity } from '@/features/communities/hooks';
import { plural } from '@/lib/format';
import { colors, gutter, radius, space } from '@/theme';

export default function CommunityInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const inbox = useInbox();
  const join = useJoinCommunity();
  const leave = useLeaveCommunity();
  const { mute } = useInboxActions();
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);

  if (community.isPending) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Community" />
        <CenteredSpinner />
      </SafeAreaView>
    );
  }
  if (community.isError) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Community" />
        <ErrorState error={community.error} onRetry={() => community.refetch()} />
      </SafeAreaView>
    );
  }

  const c = community.data;
  const member = c.membership === 'member';
  const entry = inbox.data?.find((e) => e.community.id === c.id);
  const muted = entry?.isMuted ?? false;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Community" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <CommunityAvatar id={c.id} monogram={c.monogram} uri={c.photoUrl} size={76} />
          <Text variant="pageTitle" accessibilityRole="header">
            {c.name}
          </Text>
          <View style={styles.metaRow}>
            {c.visibility === 'private' ? (
              <Lock size={15} color={colors.textTertiary} strokeWidth={1.75} />
            ) : (
              <Globe size={15} color={colors.textTertiary} strokeWidth={1.75} />
            )}
            <Text variant="meta" color="textTertiary">
              {c.visibility === 'private' ? 'Private' : 'Public'} · {c.category} · {plural(c.memberCount, 'member')}
            </Text>
          </View>
          <Text variant="post" color="textSecondary">
            {c.description}
          </Text>
          <View style={styles.actions}>
            {member ? (
              <Button
                label="Open conversation"
                icon={MessageSquareText}
                onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })}
              />
            ) : c.membership === 'pending' ? (
              <Button label="Request sent" variant="joined" disabled />
            ) : (
              <Button
                label={c.visibility === 'private' ? 'Request to join' : 'Join community'}
                loading={join.isPending}
                onPress={() =>
                  join.mutate(c.id, {
                    onSuccess: (next) =>
                      toast.show({ message: next.membership === 'pending' ? 'Request sent' : `You joined ${next.name}`, aboveNav: false }),
                    onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}`, aboveNav: false }),
                  })
                }
              />
            )}
          </View>
        </View>

        {c.pinned && member ? (
          <View style={styles.pinned}>
            <Pin size={18} color={colors.primary} strokeWidth={2} />
            <View style={styles.flex}>
              <Text variant="name">{c.pinned.title}</Text>
              <Text variant="preview" color="textSecondary">
                {c.pinned.body}
              </Text>
            </View>
          </View>
        ) : null}

        {c.rules.length ? (
          <View style={styles.section}>
            <Text variant="label" color="textTertiary">
              Community rules
            </Text>
            {c.rules.map((rule, i) => (
              <View key={rule} style={styles.rule}>
                <Text variant="numeral" style={styles.ruleNumber}>
                  {i + 1}
                </Text>
                <Text variant="message" style={styles.flex}>
                  {rule}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {member ? (
          <View style={styles.section}>
            <Hairline />
            <Pressable
              style={styles.settingRow}
              onPress={() => mute.mutate({ id: c.id, muted: !muted })}
              accessibilityRole="switch"
              accessibilityState={{ checked: muted }}
            >
              {muted ? <BellOff size={20} color={colors.text} strokeWidth={1.75} /> : <Bell size={20} color={colors.text} strokeWidth={1.75} />}
              <Text variant="tab" style={styles.flex}>
                {muted ? 'Unmute notifications' : 'Mute notifications'}
              </Text>
            </Pressable>
            <Hairline />
            <Button label={`Leave ${c.name}`} variant="warning" onPress={() => setConfirmLeave(true)} style={styles.leave} />
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmLeave}
        title={`Leave ${c.name}?`}
        body="You'll stop getting its messages and updates. You can join again later."
        confirmLabel="Leave"
        destructive
        loading={leave.isPending}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() =>
          leave.mutate(c.id, {
            onSuccess: () => {
              setConfirmLeave(false);
              toast.show({ message: `You left ${c.name}`, aboveNav: false });
              router.dismissTo('/communities');
            },
            onError: (e) => {
              setConfirmLeave(false);
              toast.show({ message: `Couldn't leave. ${describeError(e)}`, aboveNav: false });
            },
          })
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingBottom: space[8] },
  identity: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', marginTop: space[1] },
  pinned: {
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[6],
    paddingHorizontal: gutter,
    paddingVertical: space[4],
    backgroundColor: colors.surface2,
  },
  section: { paddingHorizontal: gutter, marginTop: space[6], gap: space[3] },
  rule: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  ruleNumber: { width: 22, fontSize: 18, lineHeight: 22, color: colors.textTertiary },
  settingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14 },
  leave: { alignSelf: 'flex-start', borderRadius: radius.field },
});
