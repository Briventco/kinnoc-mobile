import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Bell,
  BellOff,
  CheckCircle2,
  EyeOff,
  Globe,
  Inbox,
  Lock,
  MailPlus,
  MessageSquareText,
  Newspaper,
  Pencil,
  Pin,
  Plus,
  Share2,
  Users,
} from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '@/api/errors';
import type { Community, CommunityGroup } from '@/api/types';
import { CommunityAvatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { ConfirmDialog } from '@/components/Overlays';
import { Pressable } from '@/components/Pressable';
import { CenteredSpinner, EmptyState, ErrorState, Hairline, SkeletonList } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useCommunityGroups, useJoinGroup } from '@/features/communities/groupHooks';
import { GroupRow } from '@/features/communities/GroupRow';
import { useCommunity, useInbox, useInboxActions, useLeaveCommunity } from '@/features/communities/hooks';
import { MembershipActions } from '@/features/communities/MembershipActions';
import { SettingRow } from '@/features/settings/SettingRow';
import { plural } from '@/lib/format';
import { shareCommunity } from '@/lib/shareLinks';
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

const ROLE: Record<NonNullable<Community['role']>, string> = {
  owner: 'Owner',
  moderator: 'Moderator',
  member: 'Joined',
};

export default function CommunityInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const community = useCommunity(id);
  const inbox = useInbox();
  const leave = useLeaveCommunity();
  const { mute } = useInboxActions();
  const toast = useToast();
  const [confirmLeave, setConfirmLeave] = useState(false);

  const member = community.data?.membership === 'member';
  const groups = useCommunityGroups(id, !!community.data && (member || community.data.visibility === 'public'));
  const joinGroup = useJoinGroup(id);

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
  const manager = c.role === 'owner' || c.role === 'moderator';
  const entry = inbox.data?.find((e) => e.community.id === c.id);
  const muted = entry?.isMuted ?? false;
  const vis = VISIBILITY[c.visibility];
  const VisIcon = vis.icon;
  const canSeeMembers = member || c.visibility === 'public';
  const canSeePosts = api.capabilities.feed && (member || (c.visibility === 'public' && c.joinPolicy === 'open'));

  const push = (
    pathname: '/community/[id]/members' | '/community/[id]/manage' | '/community/[id]/edit' | '/community/[id]/posts',
    params: Record<string, string> = {},
  ) => router.push({ pathname, params: { id: c.id, ...params } });

  const openGroup = (group: CommunityGroup) =>
    router.push({ pathname: '/community/[id]/groups/[groupId]', params: { id: c.id, groupId: group.id } });

  const handleJoinGroup = (group: CommunityGroup) => {
    joinGroup.mutate(group.id, {
      onSuccess: (next) => {
        if (next.membership === 'member') {
          toast.show({
            message: `You joined ${next.name}`,
            aboveNav: false,
            action: { label: 'Open', onPress: () => openGroup(next) },
          });
        } else if (next.membership === 'pending') {
          toast.show({ message: `Request sent to ${next.name}`, aboveNav: false });
        }
      },
      onError: (e) => toast.show({ message: `Couldn't join. ${describeError(e)}`, aboveNav: false }),
    });
  };

  const allGroups = groups.data?.items ?? [];
  const joinedGroups = allGroups.filter((g) => g.membership === 'member');
  const availableGroups = allGroups.filter((g) => g.membership !== 'member');
  const canCreateGroup =
    api.capabilities.communityGroups &&
    Boolean(groups.data?.canCreateGroup || c.role === 'owner' || c.role === 'moderator');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader title="Community" />
      <ScrollView contentContainerStyle={styles.content}>
        {c.coverUrl ? (
          <Image
            source={{ uri: c.coverUrl }}
            style={styles.cover}
            contentFit="cover"
            accessibilityLabel={`${c.name} cover image`}
          />
        ) : null}

        <View style={styles.identity}>
          <View style={styles.identityHeader}>
            <CommunityAvatar id={c.id} monogram={c.monogram} uri={c.photoUrl} size={76} />
            {member && c.role ? (
              <View style={styles.statusPill}>
                <CheckCircle2 size={14} color={colors.primary} strokeWidth={2.2} />
                <Text variant="label" color="primary">
                  {ROLE[c.role]}
                </Text>
              </View>
            ) : null}
          </View>

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
            {JOIN_POLICY[c.joinPolicy]}
          </Text>
          <Text variant="post" color="textSecondary">
            {c.description}
          </Text>
          <View style={styles.actions}>
            {member ? (
              <Button
                label="Open general chat"
                icon={MessageSquareText}
                onPress={() => router.push({ pathname: '/community/[id]', params: { id: c.id } })}
              />
            ) : (
              <MembershipActions community={c} />
            )}
          </View>
        </View>

        <View style={styles.groupsSection}>
          <View style={styles.groupsHeader}>
            <View style={styles.groupsTitleRow}>
              <Text variant="section">Groups</Text>
              {api.capabilities.communityGroups && allGroups.length > 0 ? (
                <View style={styles.countPill}>
                  <Text variant="label" color="textSecondary">
                    {allGroups.length}
                  </Text>
                </View>
              ) : null}
            </View>
            {canCreateGroup ? (
              <Button
                label="New group"
                variant="quiet"
                size="small"
                icon={Plus}
                onPress={() => router.push({ pathname: '/community/[id]/groups/new', params: { id: c.id } })}
              />
            ) : null}
          </View>

          {!api.capabilities.communityGroups ? (
            <View style={styles.noticeCard}>
              <Text variant="rowTitle">Sub-groups coming soon</Text>
              <Text variant="meta" color="textSecondary">
                This server does not have community group endpoints enabled yet. Use General chat below in the meantime.
              </Text>
            </View>
          ) : !member && c.visibility !== 'public' ? (
            <View style={styles.noticeCard}>
              <Text variant="meta" color="textSecondary">
                Join {c.name} to see and participate in its groups.
              </Text>
            </View>
          ) : groups.isPending ? (
            <SkeletonList rows={3} shape="square" />
          ) : groups.isError ? (
            <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />
          ) : allGroups.length === 0 ? (
            <EmptyState
              title="No groups yet"
              body={
                canCreateGroup
                  ? `Create topic or team groups inside ${c.name} so members can organise conversations.`
                  : `${c.name} doesn't have any sub-groups yet.`
              }
              action={
                canCreateGroup
                  ? {
                      label: 'Create group',
                      onPress: () => router.push({ pathname: '/community/[id]/groups/new', params: { id: c.id } }),
                    }
                  : undefined
              }
            />
          ) : (
            <View style={styles.groupsList}>
              {joinedGroups.length > 0 ? (
                <View>
                  <Text variant="label" color="textTertiary" style={styles.groupSubheader}>
                    Your groups ({joinedGroups.length})
                  </Text>
                  {joinedGroups.map((g, idx) => (
                    <View key={g.id}>
                      {idx > 0 ? <Hairline inset={gutter + 48 + space[3]} /> : null}
                      <GroupRow group={g} onPress={() => openGroup(g)} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noticeCard}>
                  <Text variant="meta" color="textSecondary">
                    You haven&apos;t joined any groups yet. Join one below to start chatting.
                  </Text>
                </View>
              )}

              {availableGroups.length > 0 ? (
                <View style={joinedGroups.length > 0 ? styles.availableBlock : undefined}>
                  <Text variant="label" color="textTertiary" style={styles.groupSubheader}>
                    Available to join ({availableGroups.length})
                  </Text>
                  {availableGroups.map((g, idx) => (
                    <View key={g.id}>
                      {idx > 0 ? <Hairline inset={gutter + 48 + space[3]} /> : null}
                      <GroupRow
                        group={g}
                        onPress={() => openGroup(g)}
                        onJoin={() => handleJoinGroup(g)}
                        joining={joinGroup.isPending && joinGroup.variables === g.id}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )}
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
              <SettingRow
                icon={Newspaper}
                label="Posts"
                detail={member ? 'Updates, questions and links from members' : 'What members are sharing'}
                onPress={() => push('/community/[id]/posts')}
              />
            </>
          ) : null}
          {canSeeMembers ? (
            <>
              <Hairline />
              <SettingRow
                icon={Users}
                label="Members"
                detail={plural(c.memberCount, 'member')}
                onPress={() => push('/community/[id]/members')}
              />
            </>
          ) : null}
          <Hairline />
          <SettingRow
            icon={Share2}
            label="Share community"
            detail="Share a link to this community"
            onPress={() =>
              void shareCommunity({
                id: c.id,
                name: c.name,
                slug: c.slug,
                visibility: c.visibility,
                description: c.description,
              })
                .then((res) => {
                  if (res.outcome === 'copied') toast.show({ message: 'Community link copied', aboveNav: false });
                })
                .catch(() => toast.show({ message: "Couldn't copy link", aboveNav: false }))
            }
          />
          {manager ? (
            <>
              <Hairline />
              <SettingRow
                icon={Inbox}
                label="Join requests"
                detail="Approve or decline people asking to join"
                onPress={() => push('/community/[id]/manage', { tab: 'requests' })}
              />
              <Hairline />
              <SettingRow
                icon={MailPlus}
                label="Invitations"
                detail="Invite people by username"
                onPress={() => push('/community/[id]/manage', { tab: 'invitations' })}
              />
            </>
          ) : null}
          {c.role === 'owner' ? (
            <>
              <Hairline />
              <SettingRow
                icon={Pencil}
                label="Edit community"
                detail="Name, description, images and who can join"
                onPress={() => push('/community/[id]/edit')}
              />
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
                {muted ? (
                  <BellOff size={20} color={colors.text} strokeWidth={1.75} />
                ) : (
                  <Bell size={20} color={colors.text} strokeWidth={1.75} />
                )}
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
              <Button
                label={`Leave ${c.name}`}
                variant="warning"
                onPress={() => setConfirmLeave(true)}
                style={styles.leave}
              />
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
  identityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: space[3],
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { marginTop: space[1] },
  groupsSection: { marginTop: space[6], gap: space[2] },
  groupsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: gutter,
    gap: space[2],
  },
  groupsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  countPill: {
    backgroundColor: colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  noticeCard: {
    marginHorizontal: gutter,
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    gap: 4,
  },
  groupsList: { gap: space[2] },
  groupSubheader: { paddingHorizontal: gutter, paddingTop: space[2], paddingBottom: space[1] },
  availableBlock: { marginTop: space[2] },
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
