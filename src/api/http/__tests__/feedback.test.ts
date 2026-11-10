import { ApiError } from '../../errors';
import { createHttpApi, FEEDBACK_ROUTES } from '..';
import type { HttpClient } from '../client';
import { toNotification, type ApiFeedback } from '../mappers';

type Call = [method: string, path: string, opts?: { query?: Record<string, unknown>; body?: unknown }];

function fakeClient(answer: (method: string, path: string) => unknown) {
  const calls: Call[] = [];
  const make =
    (method: string) =>
    async (path: string, opts?: Call[2]) => {
      calls.push([method, path, opts]);
      const result = answer(method, path);
      if (result instanceof Error) throw result;
      return result;
    };
  const client = { get: make('GET'), post: make('POST'), put: make('PUT'), patch: make('PATCH'), delete: make('DELETE') } as unknown as HttpClient;
  return { client, calls };
}

const upload = jest.fn();
const base = { uploadCommunityImage: upload, uploadPostImage: upload, uploadAvatar: upload, removeAvatarFile: jest.fn() };

/** What the API returns to the submitter, plus administrator-only fields it must never surface. */
const apiFeedback = (over: Partial<ApiFeedback> & Record<string, unknown> = {}): ApiFeedback =>
  ({
    id: 'fb-1',
    category: 'BUG_REPORT',
    subject: 'Photos upload twice',
    description: 'Posting two photos shows four.',
    status: 'UNDER_REVIEW',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-02T09:00:00.000Z',
    appVersion: '0.1.0',
    platform: 'IOS',
    osVersion: '18.2',
    attachments: [
      { position: 1, storageKey: 'u1/b.jpg', mimeType: 'image/jpeg', sizeBytes: 20 },
      { position: 0, storageKey: 'u1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, url: 'https://signed/a' },
    ],
    responses: [
      { id: 'r2', body: 'Fixed in 0.1.1.', createdAt: '2026-11-03T09:00:00.000Z', authorId: 'admin-9' },
      { id: 'r1', body: 'Thanks, we can reproduce it.', createdAt: '2026-11-02T09:00:00.000Z' },
    ],
    notes: [{ id: 'n1', body: 'INTERNAL: probably the retry queue', authorId: 'admin-9' }],
    assignee: { id: 'admin-9', displayName: 'Admin Nine' },
    assigneeId: 'admin-9',
    activities: [{ action: 'STATUS_CHANGED', details: { from: 'RECEIVED', to: 'UNDER_REVIEW' } }],
    ...over,
  }) as ApiFeedback;

describe('feedback over HTTP', () => {
  it('submits to POST /feedback with API enums, attachments and device details', async () => {
    const { client, calls } = fakeClient(() => apiFeedback());
    const api = createHttpApi(client, base);
    await api.feedback.submit({
      clientId: '7d9c2c1e-0000-4000-8000-000000000001',
      category: 'bug',
      subject: 'Photos upload twice',
      description: 'Posting two photos shows four.',
      attachments: [
        { key: 'u1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 },
        { key: 'u1/b.jpg', mimeType: 'image/jpeg', sizeBytes: 20 },
      ],
      device: { appVersion: '0.1.0', platform: 'ios', osVersion: '18.2' },
    });
    expect(calls[0][0]).toBe('POST');
    expect(calls[0][1]).toBe(FEEDBACK_ROUTES.submit);
    // `{ key }` only, in order: the API refuses unknown fields and reads type and size from Storage.
    expect(calls[0][2]?.body).toEqual({
      clientId: '7d9c2c1e-0000-4000-8000-000000000001',
      category: 'BUG_REPORT',
      subject: 'Photos upload twice',
      description: 'Posting two photos shows four.',
      attachments: [{ key: 'u1/a.jpg' }, { key: 'u1/b.jpg' }],
      platform: 'IOS',
      appVersion: '0.1.0',
      osVersion: '18.2',
    });
  });

  it('sends no device or attachment fields when there are none', async () => {
    const { client, calls } = fakeClient(() => apiFeedback({ category: 'FEATURE_REQUEST' }));
    const api = createHttpApi(client, base);
    await api.feedback.submit({ clientId: 'c', category: 'feature', subject: 'Pin messages', description: 'Pin one message.', attachments: [], device: null });
    expect(calls[0][2]?.body).toEqual({ clientId: 'c', category: 'FEATURE_REQUEST', subject: 'Pin messages', description: 'Pin one message.' });
  });

  it("lists the caller's own submissions with every status in app terms", async () => {
    const statuses = ['RECEIVED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
    const { client, calls } = fakeClient(() => ({
      items: statuses.map((status, i) => ({ id: `fb-${i}`, category: 'GENERAL', subject: `S${i}`, status, createdAt: 'x', updatedAt: 'y', responseCount: i })),
      nextCursor: 'next',
    }));
    const api = createHttpApi(client, base);
    const page = await api.feedback.mine('c1');
    expect(calls[0].slice(0, 2)).toEqual(['GET', FEEDBACK_ROUTES.mine]);
    expect(calls[0][2]?.query).toEqual({ cursor: 'c1' });
    expect(page.items.map((f) => f.status)).toEqual(['received', 'under-review', 'in-progress', 'resolved', 'closed']);
    expect(page.items[2]).toEqual({ id: 'fb-2', category: 'general', subject: 'S2', status: 'in-progress', createdAt: 'x', updatedAt: 'y', responseCount: 2 });
    expect(page.nextCursor).toBe('next');
  });

  it("shows the team's replies oldest first, without notes, assignment, activity or who replied", async () => {
    const { client, calls } = fakeClient(() => apiFeedback());
    const api = createHttpApi(client, { ...base, signFeedbackAttachment: async (key) => `https://signed/${key}` });
    const detail = await api.feedback.get('fb-1');

    expect(calls[0].slice(0, 2)).toEqual(['GET', '/feedback/fb-1']);
    expect(detail.responses).toEqual([
      { id: 'r1', body: 'Thanks, we can reproduce it.', createdAt: '2026-11-02T09:00:00.000Z' },
      { id: 'r2', body: 'Fixed in 0.1.1.', createdAt: '2026-11-03T09:00:00.000Z' },
    ]);
    expect(detail.responseCount).toBe(2);
    expect(detail.device).toEqual({ appVersion: '0.1.0', platform: 'ios', osVersion: '18.2' });

    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(/INTERNAL|admin-9|Admin Nine|STATUS_CHANGED/);
    expect(Object.keys(detail).sort()).toEqual(
      ['attachments', 'category', 'createdAt', 'description', 'device', 'id', 'responseCount', 'responses', 'status', 'subject', 'updatedAt'].sort(),
    );
  });

  it('orders attachments and signs the ones the API did not', async () => {
    const sign = jest.fn(async (key: string) => `https://signed/${key}`);
    const { client } = fakeClient(() => apiFeedback());
    const api = createHttpApi(client, { ...base, signFeedbackAttachment: sign });
    const detail = await api.feedback.get('fb-1');
    expect(detail.attachments).toEqual([
      { key: 'u1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 10, url: 'https://signed/a' },
      { key: 'u1/b.jpg', mimeType: 'image/jpeg', sizeBytes: 20, url: 'https://signed/u1/b.jpg' },
    ]);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('reports an API without the feedback routes as not available yet, not as an error to retry', async () => {
    const missing = new ApiError('not_found', 'Cannot GET', 404, {}, 'NOT_FOUND');
    const { client } = fakeClient(() => missing);
    const api = createHttpApi(client, base);
    await expect(api.feedback.mine(null)).rejects.toMatchObject({ code: 'unsupported', message: "Feedback isn't available yet." });
    await expect(api.feedback.get('fb-1')).rejects.toMatchObject({ code: 'unsupported' });
  });

  it("keeps FEEDBACK_NOT_FOUND for someone else's submission", async () => {
    const { client } = fakeClient(() => new ApiError('not_found', 'Feedback not found', 404, {}, 'FEEDBACK_NOT_FOUND'));
    const api = createHttpApi(client, base);
    await expect(api.feedback.get('theirs')).rejects.toMatchObject({ code: 'not_found', serverCode: 'FEEDBACK_NOT_FOUND' });
  });

  it('has no screenshot upload without storage', async () => {
    const { client } = fakeClient(() => null);
    const api = createHttpApi(client, base);
    await expect(api.feedback.uploadAttachment('file:///a.png')).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('FEEDBACK_RESPONSE notifications', () => {
  it('map to the feedback kind and keep the submission as their destination', () => {
    const n = toNotification({
      id: 'n1',
      type: 'FEEDBACK_RESPONSE',
      title: 'The Kinnoc team replied to your feedback',
      body: 'Fixed in 0.1.1.',
      targetUrl: '/feedback/fb-1',
      isRead: false,
      createdAt: '2026-11-03T09:00:00.000Z',
      actor: null,
    } as Parameters<typeof toNotification>[0]);
    expect(n.kind).toBe('feedback');
    expect(n.target).toBe('/feedback/fb-1');
    expect(n.title).toEqual([{ text: 'The Kinnoc team replied to your feedback', strong: true }]);
  });
});
