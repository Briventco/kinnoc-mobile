import React from 'react';
import { Text } from 'react-native';
import { act, cleanup, render, screen } from '@testing-library/react-native';
import { getListenerCount, isTimerRunning, refreshRelativeTimestamps, subscribeToClock, useRelativeTime } from '../useRelativeTime';

function TimeView({ createdAt }: { createdAt: string }) {
  const formatted = useRelativeTime(createdAt);
  return <Text>{formatted}</Text>;
}

describe('useRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  it('updates automatically as time advances', async () => {
    const start = 1761912000000;
    jest.setSystemTime(start);

    const postCreatedAt = new Date(start).toISOString();
    await render(<TimeView createdAt={postCreatedAt} />);

    expect(screen.getByText('Just now')).toBeTruthy();

    // Advance 5 seconds
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('5 seconds ago')).toBeTruthy();

    // Advance 55 seconds (total 60s)
    await act(async () => {
      jest.advanceTimersByTime(55_000);
    });
    expect(screen.getByText('1 minute ago')).toBeTruthy();

    // Advance 60 seconds (total 2m)
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('2 minutes ago')).toBeTruthy();
  });

  it('cleans up timer when all subscribers unmount', () => {
    expect(isTimerRunning()).toBe(false);
    expect(getListenerCount()).toBe(0);

    const listener = jest.fn();
    const unsubscribe = subscribeToClock(listener);

    expect(isTimerRunning()).toBe(true);
    expect(getListenerCount()).toBe(1);

    unsubscribe();
    expect(isTimerRunning()).toBe(false);
    expect(getListenerCount()).toBe(0);
  });

  it('refreshes all timestamps immediately on refreshRelativeTimestamps', async () => {
    const start = 1761912000000;
    jest.setSystemTime(start);

    const postCreatedAt = new Date(start).toISOString();
    await render(<TimeView createdAt={postCreatedAt} />);

    expect(screen.getByText('Just now')).toBeTruthy();

    // Without timer tick, shift system time and trigger manual refresh
    jest.setSystemTime(start + 10_000);
    await act(async () => {
      refreshRelativeTimestamps();
    });

    expect(screen.getByText('10 seconds ago')).toBeTruthy();
  });
});
