import { useSyncExternalStore } from 'react';
import { formatRelativeTime } from './format';

type Listener = () => void;
const listeners = new Set<Listener>();

let timerId: ReturnType<typeof setInterval> | null = null;

function onTick() {
  for (const listener of listeners) {
    listener();
  }
}

function startTimer() {
  if (timerId === null) {
    timerId = setInterval(onTick, 1000);
    // Unref timer in Node / Jest environments so it doesn't hold process open
    if (typeof timerId === 'object' && timerId !== null && 'unref' in timerId && typeof (timerId as { unref?: () => void }).unref === 'function') {
      (timerId as { unref: () => void }).unref();
    }
  }
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

/**
 * Triggers an immediate recalculation of all live relative timestamps.
 * Useful after a pull-to-refresh so existing posts show their updated ages immediately.
 */
export function refreshRelativeTimestamps(): void {
  onTick();
}

/**
 * Subscribes a listener to the shared 1-second clock tick.
 * Automatically starts the interval when the first component mounts,
 * and clears the interval when all components unmount to prevent memory leaks.
 */
export function subscribeToClock(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    startTimer();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopTimer();
    }
  };
}

export function isTimerRunning(): boolean {
  return timerId !== null;
}

export function getListenerCount(): number {
  return listeners.size;
}

/**
 * Hook that returns an automatically updating relative time string (e.g. "Just now",
 * "2 seconds ago", "5 minutes ago").
 *
 * Uses `useSyncExternalStore` so the calling component only re-renders when the
 * formatted string value actually changes, preventing unnecessary renders.
 */
export function useRelativeTime(iso: string | null | undefined): string {
  return useSyncExternalStore(
    subscribeToClock,
    () => formatRelativeTime(iso, Date.now()),
    () => formatRelativeTime(iso, Date.now()),
  );
}
