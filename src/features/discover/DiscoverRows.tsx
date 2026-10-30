import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DiscoverItem, EventItem, OpportunityItem, OpportunityType, ResourceFormat, ResourceItem, WorkArrangement } from '@/api/types';
import { OrgMonogram } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { Pressable } from '@/components/Pressable';
import { Text } from '@/components/Text';
import { useToggleSave } from '@/features/saved/hooks';
import { api } from '@/services';
import { dateStamp, daysUntil, deadlineLabel, formatEventWhen } from '@/lib/format';
import { colors, gutter, radius, space, type } from '@/theme';

export const OPPORTUNITY_LABEL: Record<OpportunityType, string> = {
  job: 'Job',
  internship: 'Internship',
  scholarship: 'Scholarship',
  hackathon: 'Hackathon',
  programme: 'Programme',
};
export const FORMAT_LABEL: Record<ResourceFormat, string> = {
  guide: 'Guide',
  video: 'Video',
  course: 'Course',
  template: 'Template',
  article: 'Article',
};
export const ARRANGEMENT_LABEL: Record<WorkArrangement, string> = { remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid' };

const open = (item: DiscoverItem) => router.push({ pathname: '/discover/[id]', params: { id: item.id } });

/* ---------- Shared pieces ---------- */

export function DateStamp({ iso, timeZone, size = 44 }: { iso: string; timeZone?: string | null; size?: number }) {
  const { month, day } = dateStamp(iso, timeZone);
  return (
    <View style={[styles.stamp, { width: size }]}>
      <Text variant="label" color="primary">
        {month}
      </Text>
      <Text variant="numeral">{day}</Text>
    </View>
  );
}

/** Kind label; only the urgent deadline part turns amber. */
export function KindLabel({ parts, urgent }: { parts: string[]; urgent?: string | null }) {
  return (
    <Text variant="label" color="textTertiary" numberOfLines={1}>
      {parts.join(' · ')}
      {urgent ? (
        <>
          {parts.length ? ' · ' : ''}
          <Text variant="label" color="warning">
            {urgent}
          </Text>
        </>
      ) : null}
    </Text>
  );
}

export function opportunityLabel(o: OpportunityItem) {
  const parts = [OPPORTUNITY_LABEL[o.type]];
  if (o.arrangement === 'remote') parts.push('Remote');
  else if (o.location) parts.push(o.location);
  const deadline = o.closesAt ? deadlineLabel(o.closesAt) : null;
  if (deadline && !deadline.urgent) parts.push(deadline.text);
  return { parts, urgent: deadline?.urgent ? deadline.text : null };
}

export function resourceLabel(r: ResourceItem) {
  return [FORMAT_LABEL[r.format], r.length].filter(Boolean) as string[];
}

/** Typographic cover for resources without an image: two letters set bottom-left on navy. */
export function TypeCover({ title, width = 44, height = 56 }: { title: string; width?: number; height?: number }) {
  const letters = title
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <View style={[styles.cover, { width, height }]}>
      <Text style={[type.featured, { color: colors.onPrimary, fontSize: Math.round(height * 0.28), lineHeight: Math.round(height * 0.32) }]} maxFontSizeMultiplier={1}>
        {letters}
      </Text>
    </View>
  );
}

function SaveButton({ item }: { item: DiscoverItem }) {
  const save = useToggleSave();
  // Saving needs the social features; without them the row keeps its spacing but shows no bookmark.
  if (!api.capabilities.social) return <View style={styles.noSave} />;
  return (
    <IconButton
      icon={Bookmark}
      label={item.savedByMe ? `Remove ${item.title} from Saved` : `Save ${item.title}`}
      color={item.savedByMe ? 'primary' : 'textTertiary'}
      fill={item.savedByMe ? 'primary' : undefined}
      onPress={() => save.mutate({ target: { kind: 'discover', item }, saved: !item.savedByMe })}
    />
  );
}

/* ---------- Rows ---------- */

function Row({ item, lead, label, sub }: { item: DiscoverItem; lead: React.ReactNode; label: React.ReactNode; sub: string }) {
  return (
    // Save is a sibling of the row's button, so screen readers reach both.
    <View style={styles.row}>
      <Pressable onPress={() => open(item)} style={styles.rowMain} accessibilityRole="button" accessibilityLabel={`${item.title}, ${sub}`} pressedOpacity={0.7}>
        {lead}
        <View style={styles.body}>
          {label}
          <Text variant="rowTitle" numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="preview" color="textSecondary" numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </Pressable>
      <SaveButton item={item} />
    </View>
  );
}

export function EventRow({ item }: { item: EventItem }) {
  return (
    <Row
      item={item}
      lead={<DateStamp iso={item.startsAt} timeZone={item.timeZone} />}
      label={<KindLabel parts={['Event', item.isOnline ? 'Online' : formatEventWhen(item.startsAt, undefined, item.timeZone)]} />}
      sub={`${item.venue} · ${item.host}`}
    />
  );
}

export function OpportunityRow({ item }: { item: OpportunityItem }) {
  const { parts, urgent } = opportunityLabel(item);
  return (
    <Row item={item} lead={<OrgMonogram id={item.organisation} monogram={item.organisationMonogram} />} label={<KindLabel parts={parts} urgent={urgent} />} sub={item.organisation} />
  );
}

export function ResourceRow({ item }: { item: ResourceItem }) {
  return (
    <Row
      item={item}
      lead={item.coverUrl ? <Image source={{ uri: item.coverUrl }} style={styles.coverImage} contentFit="cover" /> : <TypeCover title={item.title} />}
      label={<KindLabel parts={resourceLabel(item)} />}
      sub={item.publisher}
    />
  );
}

export const DiscoverRow = memo(function DiscoverRow({ item }: { item: DiscoverItem }) {
  if (item.kind === 'event') return <EventRow item={item} />;
  if (item.kind === 'opportunity') return <OpportunityRow item={item} />;
  return <ResourceRow item={item} />;
});

/* ---------- This week strip ---------- */

/** 262px item: a 148px visual over plain text. Visuals vary by type. */
export function FeaturedItem({ item }: { item: DiscoverItem }) {
  let visual: React.ReactNode;
  let label: React.ReactNode;
  let sub: string;

  if (item.kind === 'event') {
    const { month, day } = dateStamp(item.startsAt, item.timeZone);
    visual = item.coverUrl ? (
      <View style={styles.visual}>
        <Image source={{ uri: item.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        <View style={styles.photoStamp}>
          <Text variant="numeral" style={styles.photoStampDay}>
            {day}
          </Text>
          <Text variant="label" color="primary">
            {month}
          </Text>
        </View>
      </View>
    ) : (
      <View style={[styles.visual, styles.sky]}>
        <Text variant="label" color="brandNavy">
          {month}
        </Text>
        <Text style={[type.numeral, styles.bigNumeral, { color: colors.brandNavy }]}>{day}</Text>
      </View>
    );
    label = <KindLabel parts={['Event', formatEventWhen(item.startsAt, undefined, item.timeZone)]} />;
    sub = `${item.venue} · ${item.host}`;
  } else if (item.kind === 'opportunity') {
    const days = item.closesAt ? daysUntil(item.closesAt) : null;
    const { day, month } = item.closesAt ? dateStamp(item.closesAt) : { day: '', month: '' };
    visual = (
      <View style={[styles.visual, styles.navy]}>
        <Text variant="name" color="onNavySecondary">
          {item.closesAt ? 'Applications close' : 'Open applications'}
        </Text>
        {item.closesAt ? (
          <View>
            <Text style={[type.numeral, styles.bigNumeral, { color: colors.onPrimary }]}>
              {day} {month.charAt(0) + month.slice(1).toLowerCase()}
            </Text>
            {days !== null && days >= 0 ? (
              <Text variant="preview" color="onNavySecondary">
                {days === 0 ? 'Closes today' : `${days} day${days === 1 ? '' : 's'} left`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
    const { parts, urgent } = opportunityLabel(item);
    label = <KindLabel parts={parts.slice(0, 2)} urgent={urgent} />;
    sub = `${item.organisation}${item.location ? ` · ${item.location}` : ''}`;
  } else {
    visual = item.coverUrl ? (
      <Image source={{ uri: item.coverUrl }} style={styles.visual} contentFit="cover" />
    ) : (
      <View style={[styles.visual, styles.mist]}>
        <TypeCover title={item.title} width={84} height={108} />
      </View>
    );
    label = <KindLabel parts={resourceLabel(item)} />;
    sub = item.publisher;
  }

  return (
    <View style={styles.featured}>
      <Pressable onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={`${item.title}, ${sub}`} pressedOpacity={0.8}>
        {visual}
        <View style={styles.featuredText}>
          <View style={styles.featuredLabelRow}>
            <View style={styles.body}>{label}</View>
            {/* Keeps the row's height whether or not Save is offered; Save itself sits over it. */}
            <View style={styles.saveSlot} />
          </View>
          <Text variant="featured" numberOfLines={2} style={styles.featuredTitle}>
            {item.title}
          </Text>
          <Text variant="preview" color="textSecondary" numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </Pressable>
      <View style={styles.featuredSave}>
        <SaveButton item={item} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  noSave: { width: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingLeft: gutter, paddingRight: gutter - 10, paddingVertical: space[3] },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  body: { flex: 1, minWidth: 0, gap: 3 },
  stamp: { alignItems: 'center' },
  cover: { borderRadius: radius.tag, backgroundColor: colors.brandNavy, justifyContent: 'flex-end', padding: 6 },
  coverImage: { width: 44, height: 56, borderRadius: radius.tag, backgroundColor: colors.surface3 },
  featured: { width: 262 },
  visual: { height: 148, borderRadius: radius.feature, overflow: 'hidden', backgroundColor: colors.surface3 },
  photoStamp: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  photoStampDay: { fontSize: 22, lineHeight: 24 },
  navy: { backgroundColor: colors.brandNavy, padding: space[4], justifyContent: 'space-between' },
  sky: { backgroundColor: colors.primarySubtle, padding: space[4], justifyContent: 'flex-end' },
  mist: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  bigNumeral: { fontSize: 40, lineHeight: 44 },
  featuredText: { paddingTop: space[2], gap: 2 },
  saveSlot: { width: 34, height: 44 },
  // Over the save slot: below the 148px visual, the label row's top padding and offset.
  featuredSave: { position: 'absolute', top: 148 + space[2] - 4, right: -10 },
  featuredLabelRow: { flexDirection: 'row', alignItems: 'center', marginRight: -10, marginBottom: -6, marginTop: -4 },
  featuredTitle: { marginBottom: 2 },
});
