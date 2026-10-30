import { authFetch, createSupabaseAuth } from '../supabase';
import { mustClearCache } from '../session';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));

describe('mustClearCache', () => {
  it('clears on sign-out and when another account signs in, not on a token refresh', () => {
    expect(mustClearCache('u1', null)).toBe(true);
    expect(mustClearCache('u1', 'u2')).toBe(true);
    expect(mustClearCache('u1', 'u1')).toBe(false);
    expect(mustClearCache(null, 'u1')).toBe(false);
  });
});

describe('Supabase sign-out', () => {
  // The session as supabase-js stores it, split by secureStorage: `<key>.n` holds the chunk count.
  const seedSession = () => {
    mockStore.set('sb-x-auth-token.n', '1');
    mockStore.set('sb-x-auth-token.0', '{"access_token":"t"}');
  };
  const client = (error: unknown) =>
    ({ auth: { storageKey: 'sb-x-auth-token', signOut: async () => ({ error }), startAutoRefresh() {}, stopAutoRefresh() {} } }) as never;

  beforeEach(() => mockStore.clear());

  it('removes the stored session itself when supabase-js could not (an offline expired token)', async () => {
    seedSession();
    await createSupabaseAuth(client({ name: 'AuthRetryableFetchError', message: 'Network request failed' })).signOut();
    expect([...mockStore.keys()]).toEqual([]);
  });

  it('leaves storage to supabase-js when its sign-out succeeded', async () => {
    seedSession();
    await createSupabaseAuth(client(null)).signOut();
    expect(mockStore.size).toBe(2);
  });
});

describe('authFetch', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  it('aborts an auth call that hangs, and leaves storage uploads unlimited', async () => {
    jest.useFakeTimers();
    const seen: (AbortSignal | undefined)[] = [];
    globalThis.fetch = jest.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          seen.push(init?.signal ?? undefined);
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as never;

    const refresh = authFetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' });
    void authFetch('https://x.supabase.co/storage/v1/object/post-media/a.jpg', { method: 'POST' });
    jest.advanceTimersByTime(20_000);
    await expect(refresh).rejects.toThrow('Aborted');
    expect(seen[0]?.aborted).toBe(true);
    expect(seen[1]).toBeUndefined();
  });
});
