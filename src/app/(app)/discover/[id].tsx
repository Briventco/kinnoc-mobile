import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { Bookmark, Calendar, CircleAlert, Clock, ExternalLink, MapPin, Share2, Tag, Ticket, Users, Video, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Share, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DiscoverItem, EventItem } from '@/api/types';
import { OrgMonogram } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { Banner, CenteredSpinner, ErrorState, Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { ARRANGEMENT_LABEL, DateStamp, FORMAT_LABEL, KindLabel, OPPORTUNITY_LABEL, TypeCover, opportunityLabel, resourceLabel } from '@/features/discover/DiscoverRows';
import { useDiscoverItem } from '@/features/discover/hooks';
import { useToggleSave } from '@/features/saved/hooks';
import { deadlineLabel, formatDay, formatDayTime, formatEventRange, formatPrice, hasPassed, plural, timeZoneNote } from '@/lib/format';
import { openExternal } from '@/lib/links';
import { api } from '@/services';
import { colors, gutter, radius, space } from '@/theme';

export default function DiscoverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useDiscoverItem(id);
  const save = useToggleSave();

  if (item.isPending || item.isError) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader />
        {item.isPending ? <CenteredSpinner /> : <ErrorState error={item.error} onRetry={() => item.refetch()} />}
      </SafeAreaView>
    );
  }

  const d = item.data;
  const when = d.kind === 'event' ? ` · ${formatDayTime(d.startsAt, d.timeZone)}` : '';
  const share = () => void Share.share({ message: d.externalUrl ? `${d.title}${when} — ${d.externalUrl}` : `${d.title}${when} on Kinnoc` });
  const action = actionState(d);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        right={
          <>
            <IconButton icon={Share2} label="Share" onPress={share} />
            {api.capabilities.social ? (
              <IconButton
                icon={Bookmark}
                label={d.savedByMe ? 'Remove from Saved' : 'Save'}
                color={d.savedByMe ? 'primary' : 'text'}
                fill={d.savedByMe ? 'primary' : undefined}
                onPress={() => save.mutate({ target: { kind: 'discover', item: d }, saved: !d.savedByMe })}
              />
            ) : null}
          </>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <Lead item={d} />
          <Text variant="pageTitle" accessibilityRole="header">
            {d.title}
          </Text>
          {d.kind === 'event' ? <EventStatus event={d} /> : null}
          <Facts item={d} />
          <Hairline style={styles.rule} />
          {d.kind === 'event' && d.description ? (
            <>
              {d.summary ? (
                <Text variant="post" color="textSecondary">
                  {d.summary}
                </Text>
              ) : null}
              <Text variant="post" selectable>
                {d.description}
              </Text>
            </>
          ) : d.summary ? (
            <Text variant="post">{d.summary}</Text>
          ) : null}
          {d.kind === 'event' && d.tags.length ? (
            <Text variant="meta" color="textTertiary" accessibilityLabel={`Tags: ${d.tags.join(', ')}`}>
              {d.tags.map((t) => `#${t}`).join('  ')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      {d.externalUrl ? (
        <View style={styles.footer}>
          <Button
            size="large"
            icon={ExternalLink}
            label={action.label}
            disabled={action.disabled}
            onPress={() => openExternal(d.externalUrl!)}
            accessibilityHint="Opens the organiser's page in a browser"
          />
          <Text variant="meta" color="textTertiary" style={styles.footerNote}>
            Opens {hostOf(d.externalUrl)}. Kinnoc doesn&apos;t process applications or registrations.
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function hostOf(url: string) {
  return url.replace(/^https?:\/\//, '').split('/')[0];
}

function actionState(d: DiscoverItem): { label: string; disabled: boolean } {
  if (d.kind === 'event') {
    if (d.status === 'cancelled') return { label: 'Event cancelled', disabled: true };
    if (d.isPast) return { label: 'This event has ended', disabled: true };
    if (d.registrationDeadline && hasPassed(d.registrationDeadline)) return { label: 'Registration closed', disabled: true };
    return { label: 'Register on organiser site', disabled: false };
  }
  if (d.kind === 'opportunity') {
    const closed = !!d.closesAt && deadlineLabel(d.closesAt).closed;
    return { label: closed ? 'Applications closed' : 'Apply on organiser site', disabled: closed };
  }
  return { label: d.format === 'video' ? 'Watch' : 'Open resource', disabled: false };
}

/** Cancelled and ended events stay readable from a shared link, with the reason up front. */
function EventStatus({ event }: { event: EventItem }) {
  if (event.status === 'cancelled') {
    const reason = event.cancellationReason ? ` ${event.cancellationReason}` : '';
    return <Banner tone="warning" message={`This event has been cancelled.${reason}`} />;
  }
  if (event.isPast) return <Banner tone="info" message="This event has ended." />;
  return null;
}

/** A poster that fails to load is removed rather than left as a grey block. */
function Poster({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri }}
      style={styles.hero}
      contentFit="cover"
      transition={150}
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
      accessibilityLabel="Event poster"
    />
  );
}

function Lead({ item }: { item: DiscoverItem }) {
  if (item.kind === 'event') {
    return (
      <>
        {item.coverUrl ? <Poster key={item.coverUrl} uri={item.coverUrl} /> : null}
        <View style={styles.leadRow}>
          <DateStamp iso={item.startsAt} timeZone={item.timeZone} />
          <KindLabel parts={[item.category ?? 'Event', item.isOnline ? 'Online' : 'In person']} />
        </View>
      </>
    );
  }
  if (item.kind === 'opportunity') {
    const { parts, urgent } = opportunityLabel(item);
    return (
      <View style={styles.leadRow}>
        <OrgMonogram id={item.organisation} monogram={item.organisationMonogram} size={56} />
        <View style={styles.flex}>
          <KindLabel parts={parts} urgent={urgent} />
          <Text variant="name" color="textSecondary">
            {item.organisation}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.leadRow}>
      {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.resourceCover} contentFit="cover" /> : <TypeCover title={item.title} width={66} height={84} />}
      <View style={styles.flex}>
        <KindLabel parts={resourceLabel(item)} />
        <Text variant="name" color="textSecondary">
          {item.publisher}
        </Text>
      </View>
    </View>
  );
}

function Fact({ icon: Icon, label, value, warning }: { icon: LucideIcon; label: string; value: string; warning?: boolean }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon size={18} color={warning ? colors.warning : colors.textTertiary} strokeWidth={1.75} />
      <View style={styles.flex}>
        <Text variant="label" color="textTertiary">
          {label}
        </Text>
        <Text variant="message" color={warning ? 'warning' : 'text'}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Facts({ item }: { item: DiscoverItem }) {
  if (item.kind === 'event') {
    const note = timeZoneNote(item.timeZone);
    const when = formatEventRange(item.startsAt, item.endsAt, item.timeZone) + (note ? ` (${note})` : '');
    const where = item.isOnline ? 'Online' : [item.venue, item.address].filter(Boolean).join('\n');
    const price = formatPrice(item.price);
    const deadline = item.registrationDeadline;
    const deadlinePassed = !!deadline && hasPassed(deadline);
    const live = item.status !== 'cancelled' && !item.isPast;
    return (
      <View style={styles.facts}>
        <Fact icon={Calendar} label="When" value={when} />
        <Fact icon={MapPin} label="Where" value={where} />
        {item.isOnline && item.onlineUrl && live ? (
          <Button
            variant="quiet"
            icon={Video}
            label="Join online"
            onPress={() => openExternal(item.onlineUrl!)}
            accessibilityHint="Opens the event's online link in a browser"
            style={styles.factAction}
          />
        ) : null}
        <Fact icon={Users} label="Hosted by" value={item.host} />
        {price ? <Fact icon={Ticket} label="Price" value={price} /> : null}
        {deadline && live ? (
          <Fact
            icon={Clock}
            label="Register by"
            value={`${formatDayTime(deadline, item.timeZone)}${deadlinePassed ? ' · Closed' : ''}`}
            warning={deadlinePassed}
          />
        ) : null}
        {item.capacity ? <Fact icon={Tag} label="Capacity" value={plural(item.capacity, 'place')} /> : null}
      </View>
    );
  }
  if (item.kind === 'opportunity') {
    const deadline = item.closesAt ? deadlineLabel(item.closesAt) : null;
    return (
      <View style={styles.facts}>
        <Fact icon={Users} label="Type" value={OPPORTUNITY_LABEL[item.type]} />
        {item.location || item.arrangement ? (
          <Fact
            icon={MapPin}
            label="Where"
            value={[item.arrangement ? ARRANGEMENT_LABEL[item.arrangement] : null, item.location].filter(Boolean).join(' · ')}
          />
        ) : null}
        {item.closesAt && deadline ? (
          <Fact
            icon={deadline.urgent ? CircleAlert : Calendar}
            label="Deadline"
            value={`${formatDay(item.closesAt)}${deadline.urgent || deadline.closed ? ` · ${deadline.text}` : ''}`}
            warning={deadline.urgent}
          />
        ) : null}
        {item.eligibility ? <Fact icon={Users} label="Who can apply" value={item.eligibility} /> : null}
      </View>
    );
  }
  return (
    <View style={styles.facts}>
      <Fact icon={Users} label="Format" value={[FORMAT_LABEL[item.format], item.length].filter(Boolean).join(' · ')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  content: { paddingBottom: space[8] },
  body: { paddingHorizontal: gutter, paddingTop: space[4], gap: space[4] },
  hero: { width: '100%', aspectRatio: 1.72, borderRadius: radius.md, backgroundColor: colors.surface3 },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  resourceCover: { width: 66, height: 84, borderRadius: radius.tag },
  facts: { gap: space[3] },
  fact: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  rule: { marginVertical: space[1] },
  factAction: { alignSelf: 'flex-start', marginLeft: 18 + space[3] },
  footer: { paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[2], borderTopWidth: 1, borderTopColor: colors.border, gap: space[2] },
  footerNote: { textAlign: 'center' },
});
