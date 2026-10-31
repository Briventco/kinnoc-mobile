import type { Verification, VerificationCategory } from '@/api/types';

export const CATEGORY_LABEL: Record<VerificationCategory, string> = {
  founder: 'Founder',
  'student-leader': 'Student leader',
  'community-leader': 'Community leader',
  'organisation-representative': 'Organisation representative',
  other: 'Verified',
};

/** "Founder, Brivent Global Innovations": why the tick was given, or null without details. */
export function verificationDetail(v: Verification) {
  return [v.position, v.organisation].filter(Boolean).join(', ') || null;
}

/** What a screen reader says for the tick: "Verified founder, Founder, Brivent Global Innovations". */
export function verificationLabel(v: Verification) {
  const kind = v.category && v.category !== 'other' ? `Verified ${CATEGORY_LABEL[v.category].toLowerCase()}` : 'Verified';
  const detail = verificationDetail(v);
  return detail ? `${kind}, ${detail}` : kind;
}
