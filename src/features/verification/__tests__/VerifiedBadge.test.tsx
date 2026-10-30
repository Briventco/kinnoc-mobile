import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/api/errors';
import type { Verification } from '@/api/types';
import { keys, queryClient } from '@/lib/query';

import { useMyVerification } from '../hooks';
import { CATEGORY_LABEL, verificationLabel, VerifiedBadge, VerifiedName } from '../VerifiedBadge';

jest.mock('@/services', () => ({ api: { verification: { profile: jest.fn(), mine: jest.fn() } } }));
// The icon package ships ES modules Jest does not transform; the badge is checked by its label.
jest.mock('lucide-react-native', () => ({ BadgeCheck: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { verification: { profile: jest.Mock; mine: jest.Mock } } };

const founder: Verification = { isVerified: true, category: 'founder', organisation: 'Brivent Global Innovations', position: 'Founder', verifiedAt: '2026-10-30T09:00:00.000Z' };
const none: Verification = { isVerified: false, category: null, organisation: null, position: null, verifiedAt: null };

const wrap = (ui: React.ReactElement) => <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
const BADGE = /^Verified/;

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});
// Cached badges are kept for an hour; dropping them releases their timers so Jest can exit.
afterEach(() => queryClient.clear());

describe('VerifiedName', () => {
  it('shows the tick after a verified name, with what it means', async () => {
    api.verification.profile.mockResolvedValue(founder);
    await render(wrap(<VerifiedName name="Caleb Abisoye" username="caleb" />));
    expect(await screen.findByLabelText('Verified founder, Founder, Brivent Global Innovations')).toBeTruthy();
    expect(screen.getByText('Caleb Abisoye')).toBeTruthy();
    expect(api.verification.profile).toHaveBeenCalledWith('caleb');
  });

  it('shows no tick for someone unverified, revoked or expired (the API answers all three alike)', async () => {
    api.verification.profile.mockResolvedValue(none);
    await render(wrap(<VerifiedName name="Ada" username="ada" />));
    await waitFor(() => expect(api.verification.profile).toHaveBeenCalled());
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByLabelText(BADGE)).toBeNull();
  });

  it('shows the name without a tick while loading, so nothing flashes', async () => {
    let answer!: (v: Verification) => void;
    api.verification.profile.mockReturnValue(new Promise<Verification>((resolve) => (answer = resolve)));
    await render(wrap(<VerifiedName name="Caleb" username="caleb" />));
    expect(screen.getByText('Caleb')).toBeTruthy();
    expect(screen.queryByLabelText(BADGE)).toBeNull();
    // Answer at the end, so no request is left waiting when the test finishes.
    answer(founder);
    expect(await screen.findByLabelText(BADGE)).toBeTruthy();
  });

  it('falls back to the plain name when the lookup fails', async () => {
    api.verification.profile.mockRejectedValue(new ApiError('server', 'Down', 500));
    await render(wrap(<VerifiedName name="Caleb" username="caleb" />));
    // A server error is retried once, a second later, before the badge gives up.
    await waitFor(() => expect(queryClient.getQueryState(keys.verification('caleb'))?.status).toBe('error'), { timeout: 4000 });
    expect(screen.getByText('Caleb')).toBeTruthy();
    expect(screen.queryByLabelText(BADGE)).toBeNull();
  });

  it('asks once per person, however many times they appear', async () => {
    api.verification.profile.mockResolvedValue(founder);
    await render(
      wrap(
        <>
          <VerifiedName name="Caleb" username="caleb" />
          <VerifiedName name="Caleb" username="Caleb" />
          <VerifiedBadge username="caleb" />
        </>,
      ),
    );
    // Two names and one standalone badge, from one lookup.
    await waitFor(() => expect(screen.getAllByLabelText(BADGE)).toHaveLength(3));
    expect(api.verification.profile).toHaveBeenCalledTimes(1);
  });

  it('looks nothing up for a deleted or former member', async () => {
    await render(wrap(<VerifiedName name="Former member" username={null} />));
    expect(screen.getByText('Former member')).toBeTruthy();
    expect(api.verification.profile).not.toHaveBeenCalled();
  });
});

describe('labels', () => {
  it('names every category the API has', () => {
    expect(verificationLabel({ ...founder, category: 'student-leader', position: 'President', organisation: 'UNIOSUN SU' })).toBe('Verified student leader, President, UNIOSUN SU');
    expect(verificationLabel({ ...founder, category: 'community-leader', position: null, organisation: null })).toBe('Verified community leader');
    expect(verificationLabel({ ...founder, category: 'organisation-representative' })).toBe('Verified organisation representative, Founder, Brivent Global Innovations');
    expect(verificationLabel({ ...founder, category: 'other', position: null, organisation: null })).toBe('Verified');
    expect(Object.keys(CATEGORY_LABEL)).toHaveLength(5);
  });
});

describe('useMyVerification', () => {
  function Mine({ username }: { username: string }) {
    useMyVerification(username);
    return null;
  }

  it('fills the public entry for your username, so your own badge needs no second request', async () => {
    api.verification.mine.mockResolvedValue({ ...founder, status: 'active', expiresAt: null });
    await render(wrap(<Mine username="Caleb" />));
    await waitFor(() => expect(queryClient.getQueryData(keys.verification('caleb'))).toEqual(founder));
    expect(api.verification.profile).not.toHaveBeenCalled();
  });

  it('keeps an expired verification off your public badge', async () => {
    api.verification.mine.mockResolvedValue({ ...founder, isVerified: false, status: 'expired', expiresAt: '2026-10-01T00:00:00.000Z' });
    await render(wrap(<Mine username="caleb" />));
    await waitFor(() => expect(queryClient.getQueryData<Verification>(keys.verification('caleb'))?.isVerified).toBe(false));
  });
});
