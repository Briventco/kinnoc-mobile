import { ApiError } from '@/api/errors';
import type { FeedbackDetail, FeedbackInput } from '@/api/types';

import type { FeedbackDraft } from '../model';
import { createFeedbackPublisher } from '../submit';

// expo-crypto has no random source under Jest; any distinct UUID-shaped IDs will do.
jest.mock('@/lib/format', () => {
  let n = 0;
  return { uid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

const device = { appVersion: '0.1.0', platform: 'android' as const, osVersion: '14' };
const draft: FeedbackDraft = {
  category: 'bug',
  subject: '  Photos upload twice  ',
  description: 'Posting two photos on mobile data shows four.',
  attachments: ['file:///a.png', 'file:///b.png'],
};

function fakeApi() {
  const submitted: FeedbackInput[] = [];
  const uploadAttachment = jest.fn(async (uri: string) => ({ key: `u1/${uri.slice(-5)}`, mimeType: 'image/jpeg', sizeBytes: 1200 }));
  const submit = jest.fn(async (input: FeedbackInput): Promise<FeedbackDetail> => {
    submitted.push(input);
    return {
      id: 'fb-1',
      category: input.category,
      subject: input.subject,
      description: input.description,
      status: 'received',
      createdAt: '2026-11-07T10:00:00.000Z',
      updatedAt: '2026-11-07T10:00:00.000Z',
      responseCount: 0,
      device: input.device,
      attachments: input.attachments.map((a) => ({ ...a, url: null })),
      responses: [],
    };
  });
  return { api: { feedback: { submit, uploadAttachment, mine: jest.fn(), get: jest.fn() } }, submitted, submit, uploadAttachment };
}

describe('createFeedbackPublisher', () => {
  it('uploads screenshots first, then submits trimmed text with their keys and the device for a bug', async () => {
    const { api, submitted, uploadAttachment } = fakeApi();
    const stages: string[] = [];
    const publish = createFeedbackPublisher(api, () => device);
    const created = await publish(draft, (s) => stages.push(s));

    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(stages).toEqual(['uploading', 'sending']);
    expect(submitted[0]).toMatchObject({
      category: 'bug',
      subject: 'Photos upload twice',
      description: 'Posting two photos on mobile data shows four.',
      attachments: [
        { key: 'u1/a.png', mimeType: 'image/jpeg', sizeBytes: 1200 },
        { key: 'u1/b.png', mimeType: 'image/jpeg', sizeBytes: 1200 },
      ],
      device,
    });
    expect(submitted[0].clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.id).toBe('fb-1');
  });

  it('sends no device details with other kinds of feedback', async () => {
    const { api, submitted } = fakeApi();
    await createFeedbackPublisher(api, () => device)({ ...draft, category: 'feature', attachments: [] });
    expect(submitted[0].device).toBeNull();
    expect(submitted[0].attachments).toEqual([]);
  });

  it('refuses an invalid draft without uploading or sending anything', async () => {
    const { api, submit, uploadAttachment } = fakeApi();
    const publish = createFeedbackPublisher(api, () => device);
    await expect(publish({ ...draft, subject: ' ' })).rejects.toMatchObject({ code: 'validation', fields: { subject: 'Add a subject.' } });
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('fails the submission when a screenshot fails, and a retry uploads only what is missing', async () => {
    const { api, submit, uploadAttachment } = fakeApi();
    uploadAttachment.mockImplementationOnce(async () => ({ key: 'u1/a.png', mimeType: 'image/jpeg', sizeBytes: 1 }));
    uploadAttachment.mockImplementationOnce(async () => {
      throw new ApiError('network', 'Could not connect to storage.');
    });
    const publish = createFeedbackPublisher(api, () => device);

    await expect(publish(draft)).rejects.toMatchObject({ code: 'network' });
    expect(submit).not.toHaveBeenCalled();

    await publish(draft);
    expect(uploadAttachment).toHaveBeenCalledTimes(3);
    expect(uploadAttachment.mock.calls.map(([uri]) => uri)).toEqual(['file:///a.png', 'file:///b.png', 'file:///b.png']);
  });

  it('retries a failed send with the same clientId, so the server never records it twice', async () => {
    const { api, submit, submitted } = fakeApi();
    submit.mockImplementationOnce(async (input) => {
      submitted.push(input);
      throw new ApiError('timeout', 'Request timed out');
    });
    const publish = createFeedbackPublisher(api, () => device);

    await expect(publish(draft)).rejects.toMatchObject({ code: 'timeout' });
    await publish(draft);
    expect(submitted).toHaveLength(2);
    expect(submitted[1].clientId).toBe(submitted[0].clientId);
  });

  it('uses a new clientId for the next submission after a success', async () => {
    const { api, submitted } = fakeApi();
    const publish = createFeedbackPublisher(api, () => device);
    await publish({ ...draft, attachments: [] });
    await publish({ ...draft, attachments: [] });
    expect(submitted[1].clientId).not.toBe(submitted[0].clientId);
  });
});
