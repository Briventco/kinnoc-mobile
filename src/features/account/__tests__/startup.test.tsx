import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import type { Account } from '@/api/types';
import { keys, queryClient } from '@/lib/query';

import { AccountGate } from '../AccountGate';
import { clearAccountSnapshot, restoreAccountSnapshot, saveAccountSnapshot, setAccountSnapshotOwner } from '../snapshot';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/services', () => ({ api: { account: { load: jest.fn() }, capabilities: { interestCatalogue: true } } }));
jest.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ status: 'signedIn', session: { user: { id: 'session-1', email: 'ada@example.com' } }, signOut: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { api } = require('@/services') as { api: { account: { load: jest.Mock } } };

const account: Account = { id: 'acct-1', email: 'ada@example.com', profile: { username: 'ada', displayName: 'Ada' }, status: 'active' };
const App = () => <Text>The app</Text>;
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const gate = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <QueryClientProvider client={queryClient}>
      <AccountGate>
        <App />
      </AccountGate>
    </QueryClientProvider>
  </SafeAreaProvider>
);

beforeEach(async () => {
  queryClient.clear();
  jest.clearAllMocks();
  await clearAccountSnapshot();
  setAccountSnapshotOwner('session-1');
});
afterEach(() => queryClient.clear());

describe('account snapshot', () => {
  it('seeds the account for the same signed-in user, marked for a re-check', async () => {
    await saveAccountSnapshot('session-1', account);
    await expect(restoreAccountSnapshot('session-1', 'ada@example.com')).resolves.toBe(true);
    expect(queryClient.getQueryData(keys.account)).toEqual(account);
    expect(queryClient.getQueryState(keys.account)?.isInvalidated).toBe(true);
  });

  it('is never written for a user who has since signed out', async () => {
    setAccountSnapshotOwner(null);
    await saveAccountSnapshot('session-1', account);
    await expect(restoreAccountSnapshot('session-1', 'ada@example.com')).resolves.toBe(false);
  });

  it('is not kept for a suspended or deactivated account', async () => {
    await saveAccountSnapshot('session-1', account);
    await saveAccountSnapshot('session-1', { ...account, status: 'deactivated' });
    await expect(restoreAccountSnapshot('session-1', 'ada@example.com')).resolves.toBe(false);
  });

  it('is ignored for anyone else, and gone after sign-out', async () => {
    await saveAccountSnapshot('session-1', account);
    await expect(restoreAccountSnapshot('someone-else', 'x@example.com')).resolves.toBe(false);
    await clearAccountSnapshot();
    await expect(restoreAccountSnapshot('session-1', 'ada@example.com')).resolves.toBe(false);
    expect(queryClient.getQueryData(keys.account)).toBeUndefined();
  });
});

describe('AccountGate at start-up', () => {
  it('opens the app at once for a returning user, re-checking the account behind it', async () => {
    await saveAccountSnapshot('session-1', account);
    await restoreAccountSnapshot('session-1', 'ada@example.com');
    let answer!: (a: Account) => void;
    api.account.load.mockReturnValue(new Promise<Account>((resolve) => (answer = resolve)));
    await render(gate());
    expect(screen.getByText('The app')).toBeTruthy();
    expect(api.account.load).toHaveBeenCalledTimes(1);
    answer(account);
    await waitFor(() => expect(queryClient.getQueryState(keys.account)?.isInvalidated).toBe(false));
  });

  it('keeps the app open when the re-check cannot reach the API', async () => {
    await saveAccountSnapshot('session-1', account);
    await restoreAccountSnapshot('session-1', 'ada@example.com');
    api.account.load.mockRejectedValue(new ApiError('validation', 'Bad request', 400));
    await render(gate());
    await waitFor(() => expect(queryClient.getQueryState(keys.account)?.status).toBe('error'));
    expect(screen.getByText('The app')).toBeTruthy();
  });

  it('closes the app when the re-check says the account is blocked', async () => {
    await saveAccountSnapshot('session-1', account);
    await restoreAccountSnapshot('session-1', 'ada@example.com');
    api.account.load.mockRejectedValue(new ApiError('forbidden', 'Suspended', 403));
    await render(gate());
    expect(await screen.findByText("You can't use Kinnoc right now")).toBeTruthy();
    expect(screen.queryByText('The app')).toBeNull();
  });

  it('closes the app for an account provisioning reports as suspended', async () => {
    await saveAccountSnapshot('session-1', account);
    await restoreAccountSnapshot('session-1', 'ada@example.com');
    api.account.load.mockResolvedValue({ ...account, status: 'suspended' });
    await render(gate());
    expect(await screen.findByText(/This account is suspended/)).toBeTruthy();
    expect(screen.queryByText('The app')).toBeNull();
  });

  it('keeps the splash up on a first sign-in until the account is known', async () => {
    let answer!: (a: Account) => void;
    api.account.load.mockReturnValue(new Promise<Account>((resolve) => (answer = resolve)));
    await render(gate());
    expect(screen.getByLabelText('Kinnoc is loading')).toBeTruthy();
    expect(screen.queryByText('The app')).toBeNull();
    answer(account);
    expect(await screen.findByText('The app')).toBeTruthy();
  });
});
