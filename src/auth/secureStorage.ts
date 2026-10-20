import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Key-value storage for session tokens, backed by the iOS Keychain / Android Keystore.
 * SecureStore values should stay small, so long values are split into chunks.
 * On web (development only) values are kept in memory and never written to localStorage.
 */

const CHUNK = 1800;
const memory = new Map<string, string>();
const isWeb = Platform.OS === 'web';
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function getRaw(key: string) {
  return isWeb ? (memory.get(key) ?? null) : SecureStore.getItemAsync(key);
}
async function setRaw(key: string, value: string) {
  if (isWeb) memory.set(key, value);
  else await SecureStore.setItemAsync(key, value);
}
async function deleteRaw(key: string) {
  if (isWeb) memory.delete(key);
  else await SecureStore.deleteItemAsync(key);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = Number(await getRaw(`${base}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => getRaw(`${base}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    await secureStorage.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => setRaw(`${base}.${i}`, p)));
    await setRaw(`${base}.n`, String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const count = Number(await getRaw(`${base}.n`)) || 0;
    await Promise.all(Array.from({ length: count }, (_, i) => deleteRaw(`${base}.${i}`)));
    await deleteRaw(`${base}.n`);
  },
};
