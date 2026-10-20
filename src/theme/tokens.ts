/**
 * Kinnoc design tokens — "white paper, navy ink, one blue pulse".
 * Values are copied from the Kinnoc Design System (tokens.json v2). Change them there first.
 * Red is not a Kinnoc colour; problems use `warning` (amber) with words.
 */

export const colors = {
  /** Paper. Ground for every screen, list and sheet. */
  surface: '#FFFFFF',
  /** Mist. Search fields, quiet buttons, pinned bars, Feed community-update bands, untoggled reactions. */
  surface2: '#F4F6FA',
  /** Fill for light monograms, placeholders and skeletons. */
  surface3: '#E9EDF4',
  /** Hairlines between rows, under headers and tab bars. */
  border: '#E7EBF2',
  /** Outline of text inputs (3.6:1 on surface). */
  borderStrong: '#7A879C',
  /** Ink. All primary text, active tabs and active nav. */
  text: '#0E1B3D',
  /** Ink 2. Bios, organisers, quiet links. */
  textSecondary: '#4D5B75',
  /** Ink 3. Metadata, timestamps, labels, placeholders, idle icons. */
  textTertiary: '#5E6A82',
  /** Action blue. Primary buttons, links, liked and saved states, unread, send. */
  primary: '#0068D6',
  primaryPressed: '#0057B8',
  /** Sky. Join button, light monograms, reactions you added, mention marker. Never a card background. */
  primarySubtle: '#E8F1FF',
  primarySubtleStrong: '#AFC3E8',
  /** Exact logo blue. Logo, bottom-nav tick, new-activity dots. Never text. */
  brandBlue: '#0086FF',
  /** Exact logo navy. Your chat bubbles, dark monograms, one featured visual per screen. */
  brandNavy: '#1E3A8A',
  onNavySecondary: '#C9D8F2',
  onPrimary: '#FFFFFF',
  bubbleIncoming: '#EEF1F6',
  bubbleOutgoing: '#1E3A8A',
  /** Amber. Deadlines within three days, failed sends, destructive confirmations. Always with words. */
  warning: '#B45309',
  warningSubtle: '#FFF4E5',
  success: '#166534',
  successSubtle: '#EAF6EE',
  toast: '#0E1B3D',
  toastAction: '#9CC7FF',
  scrim: 'rgba(14, 27, 61, 0.48)',
} as const;

export type ColorName = keyof typeof colors;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 22,
  6: 24,
  8: 32,
} as const;

/** Screen gutter. */
export const gutter = space[4];

export const radius = {
  tag: 8,
  field: 10,
  md: 12,
  feature: 14,
  bubble: 18,
  tail: 4,
  sheet: 20,
  full: 999,
} as const;

/** Community squares use a radius of 30% of their size. People are always circles. */
export const communityRadius = (size: number) => Math.round(size * 0.3);

export const size = {
  touchMin: 44,
  headerHeight: 52,
  tabHeight: 42,
  navHeight: 60,
  rowHeight: 74,
  communityLg: 50,
  avatarPost: 40,
  avatarChat: 32,
  avatarProfile: 76,
} as const;

export const shadow = {
  /** Menus and the one lifted item in an empty state. Nothing else floats. */
  float: {
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  toast: {
    shadowColor: '#0E1B3D',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

export const hairline = 1;
