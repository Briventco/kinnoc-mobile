import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  consumePendingDestination,
  consumePendingDestinationAsync,
  getPendingDestination,
  initPendingDestination,
  setPendingDestination,
} from '../pendingNavigation';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

describe('pendingNavigation', () => {
  beforeEach(async () => {
    consumePendingDestination();
    await AsyncStorage.clear();
  });

  it('sets and gets pending destination synchronously and in storage', async () => {
    expect(getPendingDestination()).toBeNull();
    setPendingDestination('/community/comm-123');
    expect(getPendingDestination()).toBe('/community/comm-123');

    // Verify written to AsyncStorage
    const stored = await AsyncStorage.getItem('kinnoc.pending_destination');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).url).toBe('/community/comm-123');
  });

  it('consumes and clears pending destination from both memory and storage', async () => {
    setPendingDestination('/post/p-1');
    const consumed = consumePendingDestination();
    expect(consumed).toBe('/post/p-1');
    expect(getPendingDestination()).toBeNull();
    expect(consumePendingDestination()).toBeNull();

    // Verify removed from storage
    const stored = await AsyncStorage.getItem('kinnoc.pending_destination');
    expect(stored).toBeNull();
  });

  it('hydrates from storage on cold start via initPendingDestination', async () => {
    // Simulate destination written before app restart
    await AsyncStorage.setItem(
      'kinnoc.pending_destination',
      JSON.stringify({ url: '/community/tech-builders', timestamp: Date.now() }),
    );

    const hydrated = await initPendingDestination();
    expect(hydrated).toBe('/community/tech-builders');
    expect(getPendingDestination()).toBe('/community/tech-builders');
  });

  it('discards stale destinations older than 15 minutes', async () => {
    // 20 minutes ago
    const staleTime = Date.now() - 20 * 60_000;
    await AsyncStorage.setItem(
      'kinnoc.pending_destination',
      JSON.stringify({ url: '/community/stale', timestamp: staleTime }),
    );

    const hydrated = await initPendingDestination();
    expect(hydrated).toBeNull();
    expect(getPendingDestination()).toBeNull();
    expect(await AsyncStorage.getItem('kinnoc.pending_destination')).toBeNull();
  });

  it('consumes asynchronously and protects against multiple consumptions', async () => {
    await AsyncStorage.setItem(
      'kinnoc.pending_destination',
      JSON.stringify({ url: '/post/p-99', timestamp: Date.now() }),
    );

    const first = await consumePendingDestinationAsync();
    expect(first).toBe('/post/p-99');

    // Second consumption must be null (no navigation loop)
    const second = await consumePendingDestinationAsync();
    expect(second).toBeNull();
  });
});
