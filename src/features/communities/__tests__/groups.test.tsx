import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Community, CommunityGroup, MessagePage } from '@/api/types';
import GroupConversationScreen from '@/app/(app)/community/[id]/groups/[groupId]/index';
import GroupInfoScreen from '@/app/(app)/community/[id]/groups/[groupId]/info';
import CommunityInfo from '@/app/(app)/community/[id]/info';
import { ToastProvider } from '@/components/Toast';
import { queryClient } from '@/lib/query';

jest.setTimeout(20_000);

let mockUuidSeq = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuidSeq).padStart(12, '0')}`,
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return { Image: ({ accessibilityLabel }: { accessibilityLabel?: string }) => React.createElement(View, { accessibilityLabel }) };
});
jest.mock('expo-router/head', () => ({ __esModule: true, default: () => null }));

let mockParams: Record<string, string> = { id: 'c_tedx', groupId: 'g_general' };

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/services', () => ({
  api: {
    capabilities: {
      feed: true,
      social: true,
      notifications: true,
      discoverKinds: ['event'],
      reactions: true,
      messageAttachments: true,
      inboxPreferences: true,
      profileDetails: true,
      interestCatalogue: false,
      communityGroups: true,
      groupMute: false,
    },
    communities: {
      get: jest.fn(),
      inbox: jest.fn().mockResolvedValue([]),
      leave: jest.fn(),
      setMuted: jest.fn(),
    },
    groups: {
      list: jest.fn(),
      get: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      remove: jest.fn(),
      markRead: jest.fn().mockResolvedValue(undefined),
      setMuted: jest.fn().mockResolvedValue(undefined),
      messages: jest.fn(),
      sendMessage: jest.fn(),
      removeMessage: jest.fn(),
    },
    messages: {
      react: jest.fn(),
    },
    profile: {
      me: jest.fn().mockResolvedValue({
        id: 'u_me',
        username: 'caleb',
        displayName: 'Caleb',
        avatarUrl: null,
        headline: null,
        location: null,
        bio: null,
        website: null,
        interests: [],
        interestSlugs: [],
        followerCount: 0,
        followingCount: 0,
        communityCount: 1,
        isMe: true,
        isFollowing: false,
      }),
    },
  },
  realtime: {
    live: false,
    subscribe: jest.fn(() => () => {}),
    sendTyping: jest.fn(),
    status: jest.fn(() => 'idle'),
    onStatus: jest.fn(() => () => {}),
    reset: jest.fn(),
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { router } = require('expo-router') as { router: Record<'push' | 'replace' | 'back' | 'navigate' | 'dismissTo', jest.Mock> };
const { api } = require('@/services') as {
  api: {
    capabilities: { communityGroups: boolean };
    communities: { get: jest.Mock };
    groups: {
      list: jest.Mock;
      get: jest.Mock;
      join: jest.Mock;
      messages: jest.Mock;
      sendMessage: jest.Mock;
    };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const renderWithProviders = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );

const sampleCommunity: Community = {
  id: 'c_tedx',
  slug: 'tedx-junior-show',
  name: 'TEDx Junior Show',
  monogram: 'TJ',
  photoUrl: null,
  coverUrl: null,
  memberCount: 140,
  category: 'Events',
  categorySlug: 'events',
  visibility: 'public',
  description: 'Organising TEDx Junior Show.',
  joinPolicy: 'open',
  membership: 'member',
  role: 'owner',
  pinned: null,
  rules: [],
};

const joinedGroup: CommunityGroup = {
  id: 'g_general',
  communityId: 'c_tedx',
  name: 'General Discussion',
  description: 'All community announcements',
  monogram: 'GD',
  photoUrl: null,
  iconName: 'messages-square',
  memberCount: 140,
  joinPolicy: 'open',
  membership: 'member',
  role: 'admin',
  unreadCount: 2,
  isMuted: false,
  isDefault: true,
  lastMessage: {
    seq: 1,
    senderName: 'Ada',
    isMine: false,
    text: 'Welcome everyone!',
    kind: 'text',
    sentAt: new Date().toISOString(),
  },
  receipts: { deliveredSeq: 1, readSeq: 0 },
  permissions: {
    canJoin: false,
    canLeave: false,
    canEdit: true,
    canDelete: false,
    canManageMembers: true,
    canSendMessages: true,
  },
  createdAt: new Date().toISOString(),
};

const unjoinedGroup: CommunityGroup = {
  id: 'g_volunteers',
  communityId: 'c_tedx',
  name: 'Volunteers',
  description: 'On-site logistics and hospitality',
  monogram: 'V',
  photoUrl: null,
  iconName: 'users',
  memberCount: 24,
  joinPolicy: 'open',
  membership: 'none',
  role: null,
  unreadCount: 0,
  isMuted: false,
  isDefault: false,
  lastMessage: null,
  receipts: null,
  permissions: {
    canJoin: true,
    canLeave: false,
    canEdit: false,
    canDelete: false,
    canManageMembers: false,
    canSendMessages: false,
  },
  createdAt: new Date().toISOString(),
};

beforeAll(() => {
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({
    ...defaults,
    queries: { ...defaults.queries, gcTime: 0 },
    mutations: { ...defaults.mutations, gcTime: 0 },
  });
});

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  api.capabilities.communityGroups = true;
  mockParams = { id: 'c_tedx', groupId: 'g_general' };
  api.communities.get.mockResolvedValue(sampleCommunity);
});

afterEach(() => {
  queryClient.clear();
});

describe('CommunityInfo with Groups', () => {
  it('renders joined and available groups, opens group chat, and joins available groups', async () => {
    api.groups.list.mockResolvedValue({ items: [joinedGroup, unjoinedGroup], canCreateGroup: true });
    api.groups.join.mockResolvedValue({ ...unjoinedGroup, membership: 'member', role: 'member', permissions: { ...unjoinedGroup.permissions, canJoin: false, canLeave: true, canSendMessages: true } });

    await renderWithProviders(<CommunityInfo />);

    await waitFor(() => expect(screen.getByText('TEDx Junior Show')).toBeTruthy());
    expect(screen.getByText('Your groups (1)')).toBeTruthy();
    expect(screen.getByText('General Discussion')).toBeTruthy();
    expect(screen.getByText('Available to join (1)')).toBeTruthy();
    expect(screen.getByText('Volunteers')).toBeTruthy();
    expect(screen.getByText('New group')).toBeTruthy();

    await fireEvent.press(screen.getByText('General Discussion'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/community/[id]/groups/[groupId]',
      params: { id: 'c_tedx', groupId: 'g_general' },
    });

    await fireEvent.press(screen.getByText('Join'));
    await waitFor(() => expect(api.groups.join).toHaveBeenCalledWith('c_tedx', 'g_volunteers'));
  });

  it('shows empty state when a community has no groups yet', async () => {
    api.groups.list.mockResolvedValue({ items: [], canCreateGroup: true });

    await renderWithProviders(<CommunityInfo />);

    await waitFor(() => expect(screen.getByText('No groups yet')).toBeTruthy());
    expect(screen.getByText('Create group')).toBeTruthy();
  });

  it('shows honest fallback notice when communityGroups capability is disabled', async () => {
    api.capabilities.communityGroups = false;

    await renderWithProviders(<CommunityInfo />);

    await waitFor(() => expect(screen.getByText('Sub-groups coming soon')).toBeTruthy());
    expect(api.groups.list).not.toHaveBeenCalled();
  });
});

describe('GroupConversationScreen & GroupInfoScreen', () => {
  it('shows GroupJoinGate for non-members and lets them join', async () => {
    mockParams = { id: 'c_tedx', groupId: 'g_volunteers' };
    api.groups.get.mockResolvedValue(unjoinedGroup);
    api.groups.join.mockResolvedValue({ ...unjoinedGroup, membership: 'member', role: 'member' });

    await renderWithProviders(<GroupConversationScreen />);

    await waitFor(() => expect(screen.getByText('Join Volunteers')).toBeTruthy());
    await fireEvent.press(screen.getByText('Join group'));
    await waitFor(() => expect(api.groups.join).toHaveBeenCalledWith('c_tedx', 'g_volunteers'));
  });

  it('renders existing group messages and sends optimistic messages for members', async () => {
    const page: MessagePage = {
      items: [
        {
          id: 'gm_1',
          clientId: null,
          communityId: 'g_general',
          seq: 1,
          sender: { username: 'ada', displayName: 'Adaeze', avatarUrl: null },
          isMine: false,
          text: 'Welcome to General Discussion!',
          sentAt: new Date().toISOString(),
          deletedAt: null,
          replyTo: null,
          attachments: [],
          link: null,
          reactions: [],
          status: 'sent',
        },
      ],
      nextCursor: null,
      receipts: { deliveredSeq: 1, readSeq: 1 },
    };
    api.groups.get.mockResolvedValue(joinedGroup);
    api.groups.messages.mockResolvedValue(page);
    api.groups.sendMessage.mockImplementation(async (_communityId: string, _groupId: string, payload: { clientId?: string; text: string }) => ({
      id: 'gm_2',
      clientId: payload.clientId ?? 'cid_test',
      communityId: 'g_general',
      seq: 2,
      sender: { username: 'caleb', displayName: 'Caleb', avatarUrl: null },
      isMine: true,
      text: payload.text,
      sentAt: new Date().toISOString(),
      deletedAt: null,
      replyTo: null,
      attachments: [],
      link: null,
      reactions: [],
      status: 'sent',
    }));

    await renderWithProviders(<GroupConversationScreen />);

    await waitFor(() => expect(screen.getByText('Welcome to General Discussion!')).toBeTruthy());
    const input = screen.getByPlaceholderText('Message General Discussion');
    await fireEvent.changeText(input, 'Glad to be here!');
    await fireEvent.press(screen.getByLabelText('Send'));

    await waitFor(() => expect(screen.getByText('Glad to be here!')).toBeTruthy());
    await waitFor(() =>
      expect(api.groups.sendMessage).toHaveBeenCalledWith(
        'c_tedx',
        'g_general',
        expect.objectContaining({ text: 'Glad to be here!' }),
      ),
    );
  });

  it('respects backend-driven permissions on GroupInfoScreen', async () => {
    api.groups.get.mockResolvedValue({
      ...unjoinedGroup,
      membership: 'member',
      role: 'member',
      permissions: {
        canJoin: false,
        canLeave: true,
        canEdit: false,
        canDelete: false,
        canManageMembers: false,
        canSendMessages: true,
      },
    });

    await renderWithProviders(<GroupInfoScreen />);

    await waitFor(() => expect(screen.getByText('Volunteers')).toBeTruthy());
    expect(screen.getByText('Open group chat')).toBeTruthy();
    expect(screen.getByText('Leave Volunteers')).toBeTruthy();
    expect(screen.queryByText('Edit group')).toBeNull();
    expect(screen.queryByText('Delete group')).toBeNull();
    expect(screen.queryByText('Mute notifications')).toBeNull();
  });
});
