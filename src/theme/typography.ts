import type { TextStyle } from 'react-native';

import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';

/**
 * Font assets loaded at start-up. Only the weights the design system uses are bundled.
 * Each weight is its own family name, so styles set `fontFamily` and never `fontWeight`
 * (Android ignores fontWeight on custom fonts).
 */
export const fontAssets = {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
};

export const fonts = {
  display600: 'BricolageGrotesque_600SemiBold',
  display700: 'BricolageGrotesque_700Bold',
  body400: 'Figtree_400Regular',
  body500: 'Figtree_500Medium',
  body600: 'Figtree_600SemiBold',
  body700: 'Figtree_700Bold',
} as const;

/** Text styles from the design system. Hierarchy comes from weight and colour, not size jumps. */
export const type = {
  /** Welcome and onboarding headlines only. */
  hero: { fontFamily: fonts.display600, fontSize: 42, lineHeight: 44, letterSpacing: -1.4 },
  /** Sign-in, sign-up and setup titles: the welcome's voice, one size down. */
  display: { fontFamily: fonts.display600, fontSize: 32, lineHeight: 36, letterSpacing: -0.9 },
  /** Titles of the four main tabs. */
  pageTitle: { fontFamily: fonts.display600, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  /** Pushed screen titles. */
  screenTitle: { fontFamily: fonts.display600, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  /** Feed community-update headlines, dialog titles. */
  headline: { fontFamily: fonts.display600, fontSize: 20, lineHeight: 26 },
  section: { fontFamily: fonts.display600, fontSize: 18, lineHeight: 24 },
  featured: { fontFamily: fonts.display600, fontSize: 17, lineHeight: 22 },
  numeral: { fontFamily: fonts.display700, fontSize: 24, lineHeight: 28 },
  post: { fontFamily: fonts.body400, fontSize: 16, lineHeight: 24 },
  message: { fontFamily: fonts.body400, fontSize: 15, lineHeight: 22 },
  name: { fontFamily: fonts.body600, fontSize: 15, lineHeight: 20 },
  rowTitle: { fontFamily: fonts.body600, fontSize: 16, lineHeight: 22 },
  rowTitleUnread: { fontFamily: fonts.body700, fontSize: 16, lineHeight: 22 },
  preview: { fontFamily: fonts.body400, fontSize: 14, lineHeight: 20 },
  meta: { fontFamily: fonts.body500, fontSize: 13, lineHeight: 18 },
  /** Uppercase kind and section labels. Never blue. */
  label: {
    fontFamily: fonts.body700,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  button: { fontFamily: fonts.body600, fontSize: 15, lineHeight: 20 },
  buttonLarge: { fontFamily: fonts.body600, fontSize: 16, lineHeight: 20 },
  tab: { fontFamily: fonts.body500, fontSize: 15, lineHeight: 20 },
  tabActive: { fontFamily: fonts.body700, fontSize: 15, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
