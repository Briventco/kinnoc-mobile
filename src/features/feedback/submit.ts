import type { KinnocApi } from '@/api/contract';
import { ApiError } from '@/api/errors';
import type { FeedbackDetail, FeedbackDevice, UploadedFeedbackAttachment } from '@/api/types';
import { createIdempotencyKey } from '@/features/feed/drafts';

import { MAX_ATTACHMENTS, validateFeedback, type FeedbackDraft } from './model';

export type SubmitStage = 'uploading' | 'sending';

/**
 * Sends one feedback submission from the form. Screenshots are uploaded first and the submission is
 * created only with files storage has accepted; a failed upload fails the submission. Uploads are
 * kept per local URI, so a retry uploads only what is missing, and the `clientId` is kept while the
 * draft is unchanged, so a retry after a lost response returns the original submission instead
 * of creating a second one. Only bug reports carry device details.
 */
export function createFeedbackPublisher(api: Pick<KinnocApi, 'feedback'>, device: () => FeedbackDevice) {
  const key = createIdempotencyKey();
  const uploads = new Map<string, UploadedFeedbackAttachment>();

  return async (draft: FeedbackDraft, onStage?: (stage: SubmitStage) => void): Promise<FeedbackDetail> => {
    const errors = validateFeedback(draft);
    const first = Object.values(errors)[0];
    if (first || !draft.category) throw new ApiError('validation', first ?? 'Choose what your feedback is about.', null, errors as Record<string, string>);

    const category = draft.category;
    const subject = draft.subject.trim();
    const description = draft.description.trim();
    const files = draft.attachments.slice(0, MAX_ATTACHMENTS);

    if (files.some((uri) => !uploads.has(uri))) onStage?.('uploading');
    const results = await Promise.allSettled(
      files.map(async (uri) => {
        const done = uploads.get(uri);
        if (done) return done;
        const uploaded = await api.feedback.uploadAttachment(uri);
        uploads.set(uri, uploaded);
        return uploaded;
      }),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    const attachments = results.map((r) => (r as PromiseFulfilledResult<UploadedFeedbackAttachment>).value);

    onStage?.('sending');
    const clientId = key.for(JSON.stringify([category, subject, description, files]));
    const created = await api.feedback.submit({
      clientId,
      category,
      subject,
      description,
      attachments,
      device: category === 'bug' ? device() : null,
    });
    key.reset();
    uploads.clear();
    return created;
  };
}
