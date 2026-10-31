import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Verification } from '@/api/types';
import { queryClient } from '@/lib/query';

import { VerifiedName } from '../../verification/VerifiedBadge';
import { ProfileLink } from '../ProfileLink';

// The icon package ships ES modules Jest does not transform; nothing here checks icon drawing.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/services', () => ({ api: { verification: { profile: jest.fn() } } }));
// Records where each link points, without a navigation container.
const mockHrefs: unknown[] = [];
jest.mock('expo-router', () => ({
  Link: ({ href, children }: { href: unknown; children: React.ReactNode }) => {
    mockHrefs.push(href);
    return children;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { verification: { profile: jest.Mock } } };

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  </SafeAreaProvider>
);
const founder: Verification = { isVerified: true, category: 'founder', organisation: 'Brivent Global Innovations', position: 'CEO', verifiedAt: '2026-10-30T09:00:00.000Z' };

beforeEach(() => {
  queryClient.clear();
  mockHrefs.length = 0;
  jest.clearAllMocks();
});
afterEach(() => queryClient.clear());

describe('ProfileLink', () => {
  it("makes an avatar or name a link to the person's shareable profile URL", async () => {
    await render(
      wrap(
        <ProfileLink username="caleb" label="Caleb's profile">
          <Text>Caleb</Text>
        </ProfileLink>,
      ),
    );
    expect(mockHrefs).toEqual([{ pathname: '/profile/[username]', params: { username: 'caleb' } }]);
    expect(screen.getByRole('link', { name: "Caleb's profile" })).toBeTruthy();
  });

  it('shows a deleted or former member as plain content, not a link', async () => {
    await render(
      wrap(
        <ProfileLink username={null} label="Former member's profile">
          <Text>Former member</Text>
        </ProfileLink>,
      ),
    );
    expect(mockHrefs).toEqual([]);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Former member')).toBeTruthy();
  });
});

describe('explainable verification badge', () => {
  it('opens why they are verified, from public fields only', async () => {
    api.verification.profile.mockResolvedValue(founder);
    await render(wrap(<VerifiedName name="Caleb Abisoye" username="caleb" explainable />));
    fireEvent.press(await screen.findByRole('button', { name: /Why Caleb Abisoye is verified/ }));
    expect(await screen.findByText('Verified account')).toBeTruthy();
    expect(screen.getByText('Founder')).toBeTruthy();
    expect(screen.getByText('CEO, Brivent Global Innovations')).toBeTruthy();
    expect(screen.getByText(/Verified since/)).toBeTruthy();
  });

  it('is a plain, non-interactive tick in rows', async () => {
    api.verification.profile.mockResolvedValue(founder);
    await render(wrap(<VerifiedName name="Caleb Abisoye" username="caleb" />));
    expect(await screen.findByLabelText(/^Verified founder/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers nothing to explain for someone unverified', async () => {
    api.verification.profile.mockResolvedValue({ isVerified: false, category: null, organisation: null, position: null, verifiedAt: null });
    await render(wrap(<VerifiedName name="Ada" username="ada" explainable />));
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Verified account')).toBeNull();
  });
});
