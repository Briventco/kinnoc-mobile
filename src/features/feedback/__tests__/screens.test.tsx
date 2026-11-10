import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import type { FeedbackDetail, FeedbackInput, FeedbackSummary } from '@/api/types';
import { queryClient } from '@/lib/query';

import FeedbackDetailScreen from '@/app/(app)/feedback/[id]';
import FeedbackHistory from '@/app/(app)/feedback/history';
import FeedbackHome from '@/app/(app)/feedback/index';
import NewFeedback from '@/app/(app)/feedback/new';

// The icon package ships ES modules Jest does not transform; nothing here checks icon drawing.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return { Image: ({ accessibilityLabel }: { accessibilityLabel?: string }) => React.createElement(View, { accessibilityLabel }) };
});
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/media', () => ({ pickImages: jest.fn() }));
jest.mock('@/services', () => ({
  api: {
    feedback: { submit: jest.fn(), mine: jest.fn(), get: jest.fn(), uploadAttachment: jest.fn() },
    profile: { me: jest.fn() },
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { router } = require('expo-router') as { router: Record<'push' | 'replace' | 'back', jest.Mock> };
const { pickImages } = require('@/lib/media') as { pickImages: jest.Mock };
const { api } = require('@/services') as {
  api: { feedback: Record<'submit' | 'mine' | 'get' | 'uploadAttachment', jest.Mock>; profile: { me: jest.Mock } };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const show = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );

const summary = (over: Partial<FeedbackSummary> = {}): FeedbackSummary => ({
  id: 'fb-1',
  category: 'bug',
  subject: 'Photos upload twice',
  status: 'in-progress',
  createdAt: '2026-11-01T09:00:00.000Z',
  updatedAt: '2026-11-02T09:00:00.000Z',
  responseCount: 1,
  ...over,
});
const detail = (over: Partial<FeedbackDetail> = {}): FeedbackDetail => ({
  ...summary(),
  description: 'Posting two photos on mobile data shows four.',
  device: { appVersion: '0.1.0', platform: 'ios', osVersion: '18.2' },
  attachments: [],
  responses: [{ id: 'r1', body: 'Thanks, a fix is on its way.', createdAt: '2026-11-02T09:00:00.000Z' }],
  ...over,
});
const created = (input: FeedbackInput): FeedbackDetail =>
  detail({ id: 'fb-new', category: input.category, subject: input.subject, status: 'received', responseCount: 0, responses: [] });

// `queryClient.clear()` leaves a finished mutation's 5-minute cleanup timer running, which keeps
// Jest from exiting. Collect finished mutations at once in this file.
beforeAll(() => {
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, mutations: { ...defaults.mutations, gcTime: 0 } });
});

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  mockParams = {};
  api.profile.me.mockResolvedValue({ id: 'u1', username: 'ada', displayName: 'Ada' });
  api.feedback.mine.mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => queryClient.clear());

describe('Feedback home', () => {
  it('welcomes the user and offers the four kinds of feedback', async () => {
    await show(<FeedbackHome />);
    expect(screen.getByText("We'd love to hear from you.")).toBeTruthy();
    for (const title of ['General Feedback', 'Report a Bug', 'Suggest a Feature', 'Share Your Experience']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${title}\\.`) })).toBeTruthy();
    }
    expect(await screen.findByText('Nothing sent yet')).toBeTruthy();
  });

  it('opens the form with the chosen category', async () => {
    await show(<FeedbackHome />);
    await fireEvent.press(screen.getByRole('button', { name: /^Report a Bug\./ }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/feedback/new', params: { category: 'bug' } });
  });

  it('says feedback is not available yet, and disables sending, on a backend without it', async () => {
    api.feedback.mine.mockRejectedValue(new ApiError('unsupported', "Feedback isn't available yet."));
    await show(<FeedbackHome />);
    expect(await screen.findByText(/isn't available yet/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Suggest a Feature\./ }));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('Feedback form', () => {
  const fill = async (subject: string, description: string) => {
    await fireEvent.changeText(screen.getByLabelText('Subject'), subject);
    await fireEvent.changeText(screen.getByLabelText('Details'), description);
  };

  it('preselects the category from the link and lets the user change it', async () => {
    mockParams = { category: 'feature' };
    await show(<NewFeedback />);
    expect(screen.getByRole('radio', { name: 'Feature idea' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: 'Bug report' }));
    expect(screen.getByRole('radio', { name: 'Bug report' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Feature idea' }).props.accessibilityState.checked).toBe(false);
  });

  it('shows what is missing instead of sending an incomplete form', async () => {
    await show(<NewFeedback />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText('Choose what your feedback is about.')).toBeTruthy();
    expect(screen.getByText('Add a subject.')).toBeTruthy();
    expect(screen.getByText('Tell us a little more.')).toBeTruthy();
    expect(api.feedback.submit).not.toHaveBeenCalled();
  });

  it('caps the subject and description at the API limits', async () => {
    await show(<NewFeedback />);
    expect(screen.getByLabelText('Subject').props.maxLength).toBe(150);
    expect(screen.getByLabelText('Details').props.maxLength).toBe(5000);
    await fireEvent.changeText(screen.getByLabelText('Subject'), 'Hello');
    expect(screen.getByText('5 / 150')).toBeTruthy();
  });

  it('sends once, with device details for a bug, and confirms with a way to follow it', async () => {
    mockParams = { category: 'bug' };
    api.feedback.submit.mockImplementation(async (input: FeedbackInput) => created(input));
    await show(<NewFeedback />);
    expect(screen.getByText(/we'll include Kinnoc/)).toBeTruthy();
    await fill('Photos upload twice', 'Posting two photos on mobile data shows four.');

    const send = screen.getByRole('button', { name: 'Send feedback' });
    await fireEvent.press(send);
    await fireEvent.press(send);

    expect(await screen.findByText("Thanks, we've got it")).toBeTruthy();
    expect(api.feedback.submit).toHaveBeenCalledTimes(1);
    const input = api.feedback.submit.mock.calls[0][0] as FeedbackInput;
    expect(input).toMatchObject({ category: 'bug', subject: 'Photos upload twice', attachments: [] });
    expect(input.device?.platform).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'View your feedback' }));
    expect(router.replace).toHaveBeenCalledWith('/feedback/fb-new');
  });

  it('keeps what was written and explains a failed send', async () => {
    mockParams = { category: 'general' };
    api.feedback.submit.mockRejectedValue(new ApiError('network', 'Network request failed'));
    await show(<NewFeedback />);
    await fill('Love the new feed', 'The new feed is much easier to read.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));

    expect(await screen.findByText("Your feedback wasn't sent. You're offline or the connection dropped.")).toBeTruthy();
    expect(screen.getByLabelText('Subject').props.value).toBe('Love the new feed');
    expect(screen.queryByText("Thanks, we've got it")).toBeNull();
  });

  it('adds, removes and uploads screenshots', async () => {
    mockParams = { category: 'bug' };
    pickImages.mockResolvedValueOnce(['file:///one.png', 'file:///two.png']);
    api.feedback.uploadAttachment.mockImplementation(async (uri: string) => ({ key: `u1/${uri.slice(-7)}`, mimeType: 'image/jpeg', sizeBytes: 100 }));
    api.feedback.submit.mockImplementation(async (input: FeedbackInput) => created(input));
    await show(<NewFeedback />);

    await fireEvent.press(screen.getByRole('button', { name: 'Add screenshot' }));
    expect(await screen.findByLabelText('Screenshot 2')).toBeTruthy();
    expect(pickImages).toHaveBeenCalledWith('library', 5);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove screenshot 1' }));
    expect(screen.queryByLabelText('Screenshot 2')).toBeNull();
    expect(screen.getByLabelText('Screenshot 1')).toBeTruthy();

    await fill('Upload fails', 'The upload spinner never finishes.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
    await screen.findByText("Thanks, we've got it");
    expect(api.feedback.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(api.feedback.uploadAttachment).toHaveBeenCalledWith('file:///two.png');
    expect((api.feedback.submit.mock.calls[0][0] as FeedbackInput).attachments).toEqual([{ key: 'u1/two.png', mimeType: 'image/jpeg', sizeBytes: 100 }]);
  });
});

describe('Feedback history', () => {
  it('lists each submission with its subject, category, date and status', async () => {
    api.feedback.mine.mockResolvedValue({
      items: [summary(), summary({ id: 'fb-2', category: 'feature', subject: 'Pin messages', status: 'resolved', responseCount: 0 })],
      nextCursor: null,
    });
    await show(<FeedbackHistory />);
    expect(await screen.findByText('Photos upload twice')).toBeTruthy();
    expect(screen.getByText('Bug report · Sun, 1 Nov · 1 reply')).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: /^Pin messages\./ }));
    expect(router.push).toHaveBeenCalledWith('/feedback/fb-2');
  });

  it('explains what will appear when nothing has been sent', async () => {
    await show(<FeedbackHistory />);
    expect(await screen.findByText('No feedback yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
    expect(router.push).toHaveBeenCalledWith('/feedback/new');
  });
});

describe('Feedback detail', () => {
  it("shows the submission, its status and the Kinnoc team's replies", async () => {
    mockParams = { id: 'fb-1' };
    api.feedback.get.mockResolvedValue(detail());
    await show(<FeedbackDetailScreen />);
    expect(await screen.findByText('Photos upload twice')).toBeTruthy();
    expect(api.feedback.get).toHaveBeenCalledWith('fb-1');
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText("We're working on it.")).toBeTruthy();
    expect(screen.getByText('Kinnoc team')).toBeTruthy();
    expect(screen.getByText('Thanks, a fix is on its way.')).toBeTruthy();
    expect(screen.getByText('Sent with Kinnoc 0.1.0 · iOS 18.2')).toBeTruthy();
  });

  it('says when the team has not replied yet', async () => {
    mockParams = { id: 'fb-1' };
    api.feedback.get.mockResolvedValue(detail({ status: 'received', responses: [], responseCount: 0, device: null }));
    await show(<FeedbackDetailScreen />);
    expect(await screen.findByText(/No reply yet/)).toBeTruthy();
    expect(screen.queryByText('Kinnoc team')).toBeNull();
  });

  it("does not open someone else's feedback", async () => {
    mockParams = { id: 'theirs' };
    api.feedback.get.mockRejectedValue(new ApiError('not_found', 'Feedback not found', 404, {}, 'FEEDBACK_NOT_FOUND'));
    await show(<FeedbackDetailScreen />);
    expect(await screen.findByText("This feedback isn't available")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Kinnoc team')).toBeNull());
  });
});
