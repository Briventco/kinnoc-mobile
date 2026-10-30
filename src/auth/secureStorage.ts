import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Key-value storage for session tokens.
 * - On native (iOS/Android): backed by the iOS Keychain / Android Keystore via expo-secure-store.
 *   SecureStore values must stay small, so long values are split into chunks.
 * - On web: backed by standard browser persistent storage (localStorage) as recommended by Supabase,
 *   with fallback to in-memory storage if storage is unavailable or restricted.
 */

const CHUNK = 1800;
const memory = new Map<string, string>();
const isWeb = () => Platform.OS === 'web';
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

function getBrowserStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Restricted browser environments (sandboxed iframe, disabled storage)
  }
  return null;
}

async function getRaw(key: string) {
  return SecureStore.getItemAsync(key);
}
async function setRaw(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}
async function deleteRaw(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb()) {
      const storage = getBrowserStorage();
      if (storage) {
        try {
          const direct = storage.getItem(key);
          if (direct !== null) return direct;
          // Check for legacy chunked format on web
          const base = safeKey(key);
          const count = Number(storage.getItem(`${base}.n`));
          if (count > 0) {
            const parts: (string | null)[] = [];
            for (let i = 0; i < count; i++) {
              parts.push(storage.getItem(`${base}.${i}`));
            }
            if (!parts.some((p) => p === null)) {
              return parts.join('');
            }
          }
        } catch {
          // If storage access fails, fall back to memory
        }
      }
      return memory.get(key) ?? null;
    }

    const base = safeKey(key);
    const count = Number(await getRaw(`${base}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => getRaw(`${base}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb()) {
      const storage = getBrowserStorage();
      if (storage) {
        try {
          storage.setItem(key, value);
          // Clean up legacy chunked keys if present
          const base = safeKey(key);
          const count = Number(storage.getItem(`${base}.n`)) || 0;
          for (let i = 0; i < count; i++) {
            storage.removeItem(`${base}.${i}`);
          }
          storage.removeItem(`${base}.n`);
          memory.set(key, value);
          return;
        } catch {
          // Storage failed (e.g. QuotaExceededError), fall back to memory
        }
      }
      memory.set(key, value);
      return;
    }

    const base = safeKey(key);
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => setRaw(`${base}.${i}`, p)));
    await setRaw(`${base}.n`, String(parts.length));
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb()) {
      const storage = getBrowserStorage();
      if (storage) {
        try {
          storage.removeItem(key);
          const base = safeKey(key);
          const count = Number(storage.getItem(`${base}.n`)) || 0;
          for (let i = 0; i < count; i++) {
            storage.removeItem(`${base}.${i}`);
          }
          storage.removeItem(`${base}.n`);
        } catch {}
      }
      memory.delete(key);
      return;
    }

    const base = safeKey(key);
    const count = Number(await getRaw(`${base}.n`)) || 0;
    await Promise.all(Array.from({ length: count }, (_, i) => deleteRaw(`${base}.${i}`)));
    await deleteRaw(`${base}.n`);
  },
};
