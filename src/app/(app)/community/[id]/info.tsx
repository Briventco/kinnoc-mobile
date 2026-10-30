import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, BellOff, EyeOff, Globe, Inbox, Lock, MailPlus, MessageSquareText, Newspaper, Pencil, Pin, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { Community } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, ErrorState, Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useCommunity, useInbox, useInboxActions, useLeaveCommunity } from '@/features/communities/hooks';
import { MembershipActions } from '@/features/communities/MembershipActions';
import { SettingRow } from '@/features/settings/SettingRow';
import { plural } from '@/lib/format';
import { api } from '@/services';
import { colors, gutter, radius, space } from '@/theme';

const VISIBILITY = {
  public: { label: 'Public', icon: Globe },
  unlisted: { label: 'Unlisted', icon: EyeOff },
  private: { label: 'Private', icon: Lock },
} as const;

const JOIN_POLICY: Record<Community['joinPolicy'], string> = {
  open: 'Anyone can join',
  approval: 'Owners and moderators approve new members',
  'invite-only': 'Members join by invitation',
};

const ROLE: Record<NonNullable<Community['role']>, string> = { owner: 'You own this community', moderator: 'You moderate this community', member: 'You are a member' };

export default function CommunityInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const inbox = useInbox();
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
  const manager = c.role === 'owner' || c.role === 'moderator';
  const entry = inbox.data?.find((e) => e.community.id === c.id);
  const muted = entry?.isMuted ?? false;
  const vis = VISIBILITY[c.visibility];
  const VisIcon = vis.icon;
  // Members of PUBLIC communities are visible to any signed-in account; otherwise members only.
  const canSeeMembers = member || c.visibility === 'public';
  // Posts of public, open communities are readable by anyone; all others are members-only.
  const canSeePosts = api.capabilities.feed && (member || (c.visibility === 'public' && c.joinPolicy === 'open'));
  const push = (
    pathname: '/community/[id]/members' | '/community/[id]/manage' | '/community/[id]/edit' | '/community/[id]/posts',
    params: Record<string, string> = {},
  ) =>
    router.push({ pathname, params: { id: c.id, ...params } });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Community" />
      <ScrollView contentContainerStyle={styles.content}>
        {c.coverUrl ? <Image source={{ uri: c.coverUrl }} style={styles.cover} contentFit="cover" accessibilityLabel={`${c.name} cover image`} /> : null}
        <View style={styles.identity}>
          <CommunityAvatar id={c.id} monogram={c.monogram} uri={c.photoUrl} size={76} />
          <Text variant="pageTitle" accessibilityRole="header">
            {c.name}
          </Text>
          <View style={styles.metaRow}>
            <VisIcon size={15} color={colors.textTertiary} strokeWidth={1.75} />
            <Text variant="meta" color="textTertiary">
              {vis.label} · {c.category} · {plural(c.memberCount, 'member')}
            </Text>
          </View>
          <Text variant="meta" color="textTertiary">
            {member && c.role ? `${ROLE[c.role]} · ` : ''}
            {JOIN_POLICY[c.joinPolicy]}
          </Text>
          <Text variant="post" color="textSecondary">
            {c.description}
          </Text>
          <View style={styles.actions}>
            {member ? (
              <Button label="Open conversation" icon={MessageSquareText} onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })} />
            ) : (
              <MembershipActions community={c} />
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

        <View style={styles.rows}>
          {canSeePosts ? (
            <>
              <Hairline />
              <SettingRow icon={Newspaper} label="Posts" detail={member ? 'Updates, questions and links from members' : 'What members are sharing'} onPress={() => push('/community/[id]/posts')} />
            </>
          ) : null}
          {canSeeMembers ? (
            <>
              <Hairline />
              <SettingRow icon={Users} label="Members" detail={plural(c.memberCount, 'member')} onPress={() => push('/community/[id]/members')} />
            </>
          ) : null}
          {manager ? (
            <>
              <Hairline />
              <SettingRow icon={Inbox} label="Join requests" detail="Approve or decline people asking to join" onPress={() => push('/community/[id]/manage', { tab: 'requests' })} />
              <Hairline />
              <SettingRow icon={MailPlus} label="Invitations" detail="Invite people by username" onPress={() => push('/community/[id]/manage', { tab: 'invitations' })} />
            </>
          ) : null}
          {c.role === 'owner' ? (
            <>
              <Hairline />
              <SettingRow icon={Pencil} label="Edit community" detail="Name, description, images and who can join" onPress={() => push('/community/[id]/edit')} />
            </>
          ) : null}
          {member && api.capabilities.inboxPreferences ? (
            <>
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
            </>
          ) : null}
          {canSeeMembers || manager ? <Hairline /> : null}
        </View>

        {member ? (
          <View style={styles.section}>
            {c.role === 'owner' ? (
              <Text variant="meta" color="textTertiary">
                Owners can’t leave. To step down, make another member the owner from the member list; you’ll become a moderator and can then leave.
              </Text>
            ) : (
              <Button label={`Leave ${c.name}`} variant="warning" onPress={() => setConfirmLeave(true)} style={styles.leave} />
            )}
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmLeave}
        title={`Leave ${c.name}?`}
        body={
          c.joinPolicy === 'open'
            ? "You'll stop getting its messages. You can join again later."
            : "You'll stop getting its messages. To come back you'll need to be approved or invited again."
        }
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
  cover: { width: '100%', aspectRatio: 3, backgroundColor: colors.surface3 },
  identity: { paddingHorizontal: gutter, paddingTop: space[5], gap: space[3] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { marginTop: space[1] },
  pinned: {
    flexDirection: 'row',
    gap: space[3],
    marginTop: space[6],
    paddingHorizontal: gutter,
    paddingVertical: space[4],
    backgroundColor: colors.surface2,
  },
  section: { paddingHorizontal: gutter, marginTop: space[6], gap: space[3] },
  rows: { marginTop: space[6] },
  rule: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  ruleNumber: { width: 22, fontSize: 18, lineHeight: 22, color: colors.textTertiary },
  settingRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: gutter },
  leave: { alignSelf: 'flex-start', borderRadius: radius.field },
});
