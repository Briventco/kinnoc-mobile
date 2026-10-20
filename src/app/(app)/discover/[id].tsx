import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bookmark, Calendar, CircleAlert, ExternalLink, MapPin, Share2, Users, type LucideIcon } from 'lucide-react-native';
import { Share, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DiscoverItem } from '@/api/types';
import { OrgMonogram } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/Header';
import { IconButton } from '@/components/IconButton';
import { CenteredSpinner, ErrorState, Hairline } from '@/components/States';
import { Text } from '@/components/Text';
import { ARRANGEMENT_LABEL, DateStamp, FORMAT_LABEL, KindLabel, OPPORTUNITY_LABEL, TypeCover, opportunityLabel, resourceLabel } from '@/features/discover/DiscoverRows';
import { useDiscoverItem } from '@/features/discover/hooks';
import { useToggleSave } from '@/features/saved/hooks';
import { deadlineLabel, formatDay, formatDayTime, formatTime } from '@/lib/format';
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
  const share = () => void Share.share({ message: d.externalUrl ? `${d.title} — ${d.externalUrl}` : `${d.title} on Kinnoc` });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScreenHeader
        right={
          <>
            <IconButton icon={Share2} label="Share" onPress={share} />
            <IconButton
              icon={Bookmark}
              label={d.savedByMe ? 'Remove from Saved' : 'Save'}
              color={d.savedByMe ? 'primary' : 'text'}
              fill={d.savedByMe ? 'primary' : undefined}
              onPress={() => save.mutate({ target: { kind: 'discover', item: d }, saved: !d.savedByMe })}
            />
          </>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <Lead item={d} />
          <Text variant="pageTitle" accessibilityRole="header">
            {d.title}
          </Text>
          <Facts item={d} />
          <Hairline style={styles.rule} />
          <Text variant="post">{d.summary}</Text>
        </View>
      </ScrollView>
      {d.externalUrl ? (
        <View style={styles.footer}>
          <Button
            size="large"
            icon={ExternalLink}
            label={actionLabel(d)}
            disabled={d.kind === 'opportunity' && !!d.closesAt && deadlineLabel(d.closesAt).closed}
            onPress={() => void WebBrowser.openBrowserAsync(d.externalUrl!)}
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

function actionLabel(d: DiscoverItem) {
  if (d.kind === 'event') return 'Register on organiser site';
  if (d.kind === 'opportunity') return d.closesAt && deadlineLabel(d.closesAt).closed ? 'Applications closed' : 'Apply on organiser site';
  return d.format === 'video' ? 'Watch' : 'Open resource';
}

function Lead({ item }: { item: DiscoverItem }) {
  if (item.kind === 'event') {
    return (
      <>
        {item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.hero} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        <View style={styles.leadRow}>
          <DateStamp iso={item.startsAt} />
          <KindLabel parts={['Event', item.isOnline ? 'Online' : 'In person']} />
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
    const when = item.endsAt ? `${formatDay(item.startsAt)} to ${formatDay(item.endsAt)}, from ${formatTime(item.startsAt)}` : formatDayTime(item.startsAt);
    return (
      <View style={styles.facts}>
        <Fact icon={Calendar} label="When" value={when} />
        <Fact icon={MapPin} label="Where" value={item.isOnline ? 'Online' : item.venue} />
        <Fact icon={Users} label="Hosted by" value={item.host} />
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
  footer: { paddingHorizontal: gutter, paddingTop: space[3], paddingBottom: space[2], borderTopWidth: 1, borderTopColor: colors.border, gap: space[2] },
  footerNote: { textAlign: 'center' },
});
