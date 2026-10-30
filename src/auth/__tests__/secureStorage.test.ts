import { Platform } from 'react-native';

import { secureStorage } from '../secureStorage';

const mockNativeStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockNativeStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockNativeStore.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockNativeStore.delete(k);
  }),
}));

describe('secureStorage on web and native', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  });

  describe('web browser storage', () => {
    let mockLocalStorage: Record<string, string>;

    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      mockLocalStorage = {};

      const storageMock: Storage = {
        getItem: jest.fn((key: string) => mockLocalStorage[key] ?? null),
        setItem: jest.fn((key: string, value: string) => {
          mockLocalStorage[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
          delete mockLocalStorage[key];
        }),
        clear: jest.fn(() => {
          mockLocalStorage = {};
        }),
        key: jest.fn((index: number) => Object.keys(mockLocalStorage)[index] ?? null),
        get length() {
          return Object.keys(mockLocalStorage).length;
        },
      };

      Object.defineProperty(globalThis, 'window', {
        value: { localStorage: storageMock },
        writable: true,
        configurable: true,
      });
    });

    it('persists sessions in localStorage across browser refreshes', async () => {
      const sessionData = JSON.stringify({ access_token: 'valid-token', user: { id: 'u_123' } });

      await secureStorage.setItem('sb-test-token', sessionData);
      expect(mockLocalStorage['sb-test-token']).toBe(sessionData);

      const retrieved = await secureStorage.getItem('sb-test-token');
      expect(retrieved).toBe(sessionData);
    });

    it('clears persisted session on sign-out / removeItem', async () => {
      await secureStorage.setItem('sb-test-token', 'my-token');
      expect(mockLocalStorage['sb-test-token']).toBe('my-token');

      await secureStorage.removeItem('sb-test-token');
      expect(mockLocalStorage['sb-test-token']).toBeUndefined();
      expect(await secureStorage.getItem('sb-test-token')).toBeNull();
    });

    it('retrieves legacy chunked web storage and cleans it up on setItem', async () => {
      mockLocalStorage['sb_old.n'] = '2';
      mockLocalStorage['sb_old.0'] = 'chunk-one-';
      mockLocalStorage['sb_old.1'] = 'chunk-two';

      const retrieved = await secureStorage.getItem('sb_old');
      expect(retrieved).toBe('chunk-one-chunk-two');

      // Writing new value cleans up the chunked keys
      await secureStorage.setItem('sb_old', 'unified-value');
      expect(mockLocalStorage['sb_old']).toBe('unified-value');
      expect(mockLocalStorage['sb_old.n']).toBeUndefined();
      expect(mockLocalStorage['sb_old.0']).toBeUndefined();
      expect(mockLocalStorage['sb_old.1']).toBeUndefined();
    });

    it('falls back to memory if localStorage is restricted or throws', async () => {
      Object.defineProperty(globalThis, 'window', {
        value: {
          get localStorage() {
            throw new Error('Access denied (private browsing / sandboxed iframe)');
          },
        },
        writable: true,
        configurable: true,
      });

      await secureStorage.setItem('kinnoc.session', 'in-memory-token');
      expect(await secureStorage.getItem('kinnoc.session')).toBe('in-memory-token');

      await secureStorage.removeItem('kinnoc.session');
      expect(await secureStorage.getItem('kinnoc.session')).toBeNull();
    });
  });

  describe('native platform storage', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      mockNativeStore.clear();
    });

    it('uses SecureStore with chunking on native to stay under keychain item size limits', async () => {
      // Create a payload longer than chunk size (1800)
      const longPayload = 'a'.repeat(2500);
      await secureStorage.setItem('native-key', longPayload);

      expect(mockNativeStore.get('native-key.n')).toBe('2');
      expect(mockNativeStore.get('native-key.0')).toBe('a'.repeat(1800));
      expect(mockNativeStore.get('native-key.1')).toBe('a'.repeat(700));

      const retrieved = await secureStorage.getItem('native-key');
      expect(retrieved).toBe(longPayload);

      await secureStorage.removeItem('native-key');
      expect(mockNativeStore.get('native-key.n')).toBeUndefined();
      expect(mockNativeStore.get('native-key.0')).toBeUndefined();
      expect(mockNativeStore.get('native-key.1')).toBeUndefined();
    });
  });
});
