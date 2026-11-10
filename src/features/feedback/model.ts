import type { FeedbackCategory, FeedbackDevice, FeedbackStatus } from '@/api/types';

/** API limits (kinnoc-api migration `20261107120000_feedback`). */
export const SUBJECT_MAX = 150;
export const DESCRIPTION_MAX = 5000;
/** Stricter than the API's "not blank", so a submission says enough to act on. */
export const SUBJECT_MIN = 3;
export const DESCRIPTION_MIN = 10;
/** The API accepts up to five files per submission. */
export const MAX_ATTACHMENTS = 5;

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ['general', 'bug', 'feature', 'experience'];

export const CATEGORY_COPY: Record<FeedbackCategory, { title: string; short: string; description: string; placeholder: string }> = {
  general: {
    title: 'General Feedback',
    short: 'General',
    description: 'Tell us what you think about Kinnoc.',
    placeholder: 'What would you like us to know?',
  },
  bug: {
    title: 'Report a Bug',
    short: 'Bug report',
    description: 'Something not working as it should?',
    placeholder: 'What happened, and what did you expect? The steps to make it happen again help us most.',
  },
  feature: {
    title: 'Suggest a Feature',
    short: 'Feature idea',
    description: 'Share an idea that would make Kinnoc better.',
    placeholder: 'What would you like Kinnoc to do, and how would it help you?',
  },
  experience: {
    title: 'Share Your Experience',
    short: 'Experience',
    description: 'Tell us how Kinnoc is working for you.',
    placeholder: 'What has using Kinnoc been like for you?',
  },
};

/** Every status is shown with words, never colour alone. */
export const STATUS_COPY: Record<FeedbackStatus, { label: string; explanation: string }> = {
  received: { label: 'Received', explanation: "We've got it and will look at it soon." },
  'under-review': { label: 'Under Review', explanation: 'The Kinnoc team is looking into it.' },
  'in-progress': { label: 'In Progress', explanation: "We're working on it." },
  resolved: { label: 'Resolved', explanation: "We've dealt with it. Thank you for helping." },
  closed: { label: 'Closed', explanation: 'This is closed. Send new feedback any time.' },
};

export const isFeedbackCategory = (value: unknown): value is FeedbackCategory =>
  typeof value === 'string' && (FEEDBACK_CATEGORIES as string[]).includes(value);

export interface FeedbackDraft {
  category: FeedbackCategory | null;
  subject: string;
  description: string;
  /** Local image URIs, in order. */
  attachments: string[];
}

export type FeedbackField = 'category' | 'subject' | 'description' | 'attachments';

/** Field messages for a draft; empty when it can be sent. Text is judged trimmed, as the API does. */
export function validateFeedback(draft: FeedbackDraft): Partial<Record<FeedbackField, string>> {
  const errors: Partial<Record<FeedbackField, string>> = {};
  const subject = draft.subject.trim();
  const description = draft.description.trim();
  if (!draft.category) errors.category = 'Choose what your feedback is about.';
  if (!subject) errors.subject = 'Add a subject.';
  else if (subject.length < SUBJECT_MIN) errors.subject = `Use at least ${SUBJECT_MIN} characters.`;
  else if (subject.length > SUBJECT_MAX) errors.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  if (!description) errors.description = 'Tell us a little more.';
  else if (description.length < DESCRIPTION_MIN) errors.description = `Use at least ${DESCRIPTION_MIN} characters so we can act on it.`;
  else if (description.length > DESCRIPTION_MAX) errors.description = `Keep the description under ${DESCRIPTION_MAX.toLocaleString('en')} characters.`;
  if (draft.attachments.length > MAX_ATTACHMENTS) errors.attachments = `Attach up to ${MAX_ATTACHMENTS} screenshots.`;
  return errors;
}

/** "12 / 150", or how far over the limit. */
export function characterCount(value: string, max: number): { text: string; over: boolean } {
  const length = value.trim().length;
  return length > max ? { text: `${length - max} characters over the limit`, over: true } : { text: `${length} / ${max.toLocaleString('en')}`, over: false };
}

const PLATFORM_NAME: Record<FeedbackDevice['platform'], string> = { ios: 'iOS', android: 'Android', web: 'Web', other: 'Other' };

/** "Kinnoc 0.1.0 · iOS 18.2", as shown to the sender and to the team. */
export function describeDevice(device: FeedbackDevice): string {
  const os = [PLATFORM_NAME[device.platform], device.osVersion].filter(Boolean).join(' ');
  return [device.appVersion ? `Kinnoc ${device.appVersion}` : 'Kinnoc', os].join(' · ');
}
