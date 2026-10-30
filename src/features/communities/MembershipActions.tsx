import { Mail } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { describeError } from '@/api/errors';
import type { Community } from '@/api/types';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { space } from '@/theme';

import { useCancelRequest, useDeclineInvitation, useJoinCommunity } from './hooks';

/** What a non-member sees about getting in, by membership state and join policy. */
export function accessCopy(c: Community): { title: string; body: string } {
  if (c.membership === 'invited') return { title: `You're invited to ${c.name}`, body: 'Accept to join the conversation, or decline the invitation.' };
  if (c.membership === 'pending') return { title: 'Your request is waiting', body: 'An owner or moderator will review it. Check back here once you have been approved.' };
  if (c.joinPolicy === 'invite-only') return { title: 'Invitation only', body: 'Members can join only when an owner or moderator invites them.' };
  if (c.joinPolicy === 'approval') return { title: `Ask to join ${c.name}`, body: 'An owner or moderator reviews each request before you can see the conversation.' };
  return { title: `Join ${c.name} to see the conversation`, body: c.description };
}

/**
 * The actions for the viewer's membership state: join, request, cancel a request, or accept or
 * decline an invitation. Renders nothing for members.
 */
export function MembershipActions({ community: c, onJoined }: { community: Community; onJoined?: (c: Community) => void }) {
  const join = useJoinCommunity();
  const cancel = useCancelRequest();
  const decline = useDeclineInvitation();
  const toast = useToast();
  const fail = (what: string) => (e: unknown) => toast.show({ message: `${what} ${describeError(e)}`, aboveNav: false });

  const doJoin = () =>
    join.mutate(c.id, {
      onSuccess: (next) => {
        if (next.membership === 'member') {
          toast.show({ message: `You joined ${next.name}`, aboveNav: false });
          onJoined?.(next);
        } else if (next.membership === 'pending') {
          toast.show({ message: 'Request sent', aboveNav: false });
        }
      },
      onError: fail("Couldn't join."),
    });

  if (c.membership === 'member') return null;

  if (c.membership === 'invited') {
    return (
      <View style={styles.row}>
        <Button label="Accept invitation" icon={Mail} loading={join.isPending} onPress={doJoin} />
        <Button
          label="Decline"
          variant="quiet"
          loading={decline.isPending}
          onPress={() =>
            decline.mutate(c.id, {
              onSuccess: () => toast.show({ message: 'Invitation declined', aboveNav: false }),
              onError: fail("Couldn't decline."),
            })
          }
        />
      </View>
    );
  }

  if (c.membership === 'pending') {
    return (
      <View style={styles.row}>
        <Button label="Request sent" variant="joined" disabled />
        <Button
          label="Cancel request"
          variant="text"
          loading={cancel.isPending}
          onPress={() =>
            cancel.mutate(c.id, {
              onSuccess: () => toast.show({ message: 'Request cancelled', aboveNav: false }),
              onError: fail("Couldn't cancel."),
            })
          }
        />
      </View>
    );
  }

  if (c.joinPolicy === 'invite-only') {
    return (
      <Text variant="meta" color="textTertiary">
        Invitation only
      </Text>
    );
  }

  return (
    <View style={styles.row}>
      <Button label={c.joinPolicy === 'approval' ? 'Request to join' : 'Join community'} loading={join.isPending} onPress={doJoin} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
});
