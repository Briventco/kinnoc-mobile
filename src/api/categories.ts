import type { Category } from './types';

/**
 * Canonical community categories recommended across Kinnoc.
 * Used as the baseline default catalogue and fallback when the remote catalogue
 * is loading or unseeded.
 */
export const DEFAULT_COMMUNITY_CATEGORIES: Category[] = [
  { slug: 'technology', name: 'Technology' },
  { slug: 'education', name: 'Education' },
  { slug: 'business-entrepreneurship', name: 'Business & Entrepreneurship' },
  { slug: 'arts-creativity', name: 'Arts & Creativity' },
  { slug: 'gaming', name: 'Gaming' },
  { slug: 'sports-fitness', name: 'Sports & Fitness' },
  { slug: 'lifestyle', name: 'Lifestyle' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'faith-religion', name: 'Faith & Religion' },
  { slug: 'social-community', name: 'Social & Community' },
  { slug: 'other', name: 'Other' },
];

