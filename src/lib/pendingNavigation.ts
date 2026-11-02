import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'kinnoc.pending_destination';
/** Maximum time (15 minutes) a pending destination is kept before being discarded as stale. */
const MAX_AGE_MS = 15 * 60_000;

interface StoredDestination {
  url: string;
  timestamp: number;
}

let inMemoryDestination: string | null = null;
let initialized = false;

/** Initialize from storage on startup. */
export async function initPendingDestination(): Promise<string | null> {
  if (initialized && inMemoryDestination) return inMemoryDestination;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: StoredDestination = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < MAX_AGE_MS && parsed.url) {
        inMemoryDestination = parsed.url;
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {
    // Best-effort
  } finally {
    initialized = true;
  }
  return inMemoryDestination;
}

/** Set a pending destination, both in memory and asynchronously in AsyncStorage. */
export function setPendingDestination(url: string | null): void {
  inMemoryDestination = url;
  if (!url) {
    void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    return;
  }
  const payload: StoredDestination = {
    url,
    timestamp: Date.now(),
  };
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => undefined);
}

/** Synchronous check of the active pending destination. */
export function getPendingDestination(): string | null {
  return inMemoryDestination;
}

/**
 * Consumes the pending destination once and immediately clears it
 * from both memory and persistent storage to prevent any navigation loops.
 */
export function consumePendingDestination(): string | null {
  const dest = inMemoryDestination;
  inMemoryDestination = null;
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  return dest;
}

/** Async consumer that ensures storage is checked if in-memory copy was not yet hydrated. */
export async function consumePendingDestinationAsync(): Promise<string | null> {
  if (inMemoryDestination) {
    return consumePendingDestination();
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(STORAGE_KEY);
    const parsed: StoredDestination = JSON.parse(raw);
    if (Date.now() - parsed.timestamp < MAX_AGE_MS && parsed.url) {
      return parsed.url;
    }
  } catch {
    // Best effort
  }
  return null;
}
