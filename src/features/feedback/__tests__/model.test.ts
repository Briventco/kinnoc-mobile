import {
  characterCount,
  DESCRIPTION_MAX,
  describeDevice,
  FEEDBACK_CATEGORIES,
  isFeedbackCategory,
  MAX_ATTACHMENTS,
  STATUS_COPY,
  SUBJECT_MAX,
  validateFeedback,
  type FeedbackDraft,
} from '../model';

const valid: FeedbackDraft = { category: 'bug', subject: 'Photos upload twice', description: 'Posting two photos shows four.', attachments: [] };

describe('feedback categories', () => {
  it('offers the four kinds of feedback, in order', () => {
    expect(FEEDBACK_CATEGORIES).toEqual(['general', 'bug', 'feature', 'experience']);
  });

  it('accepts only known categories from a link', () => {
    expect(isFeedbackCategory('bug')).toBe(true);
    expect(isFeedbackCategory('BUG_REPORT')).toBe(false);
    expect(isFeedbackCategory(undefined)).toBe(false);
  });
});

describe('validateFeedback', () => {
  it('passes a complete draft', () => {
    expect(validateFeedback(valid)).toEqual({});
  });

  it('requires a category, a subject and a description', () => {
    expect(validateFeedback({ category: null, subject: '', description: '', attachments: [] })).toEqual({
      category: 'Choose what your feedback is about.',
      subject: 'Add a subject.',
      description: 'Tell us a little more.',
    });
  });

  it('judges text trimmed, as the API does', () => {
    const errors = validateFeedback({ ...valid, subject: '   ab   ', description: '   short   ' });
    expect(errors.subject).toBe('Use at least 3 characters.');
    expect(errors.description).toBe('Use at least 10 characters so we can act on it.');
  });

  it('enforces the API limits on length and attachments', () => {
    const errors = validateFeedback({
      ...valid,
      subject: 'x'.repeat(SUBJECT_MAX + 1),
      description: 'y'.repeat(DESCRIPTION_MAX + 1),
      attachments: Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => `file://${i}.jpg`),
    });
    expect(errors.subject).toMatch(/under 150 characters/);
    expect(errors.description).toMatch(/under 5,000 characters/);
    expect(errors.attachments).toBe('Attach up to 5 screenshots.');
    expect(validateFeedback({ ...valid, subject: 'x'.repeat(SUBJECT_MAX) }).subject).toBeUndefined();
  });
});

describe('characterCount', () => {
  it('counts towards the limit and says how far over it is', () => {
    expect(characterCount('hello', 150)).toEqual({ text: '5 / 150', over: false });
    expect(characterCount('x'.repeat(5003), 5000)).toEqual({ text: '3 characters over the limit', over: true });
  });
});

describe('status and device copy', () => {
  it('names every status in words', () => {
    expect(Object.values(STATUS_COPY).map((s) => s.label)).toEqual(['Received', 'Under Review', 'In Progress', 'Resolved', 'Closed']);
  });

  it('describes the device a bug was reported from', () => {
    expect(describeDevice({ appVersion: '0.1.0', platform: 'ios', osVersion: '18.2' })).toBe('Kinnoc 0.1.0 · iOS 18.2');
    expect(describeDevice({ appVersion: null, platform: 'web', osVersion: null })).toBe('Kinnoc · Web');
  });
});
