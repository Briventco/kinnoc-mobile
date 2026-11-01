import { dateStamp, formatAge, formatDayTime, formatEventRange, formatEventWhen, formatPrice, formatRelativeTime, formatTime, hasPassed, timeZoneNote } from '../format';

// 21:48 UTC on Sat 31 Oct is 10:48 PM in Lagos (UTC+1) and 5:48 PM in New York (UTC−4).
const START = '2026-10-31T21:48:00.000Z';

describe('event times in the event’s zone', () => {
  it('shows the wall time where the event happens, whatever the device’s zone', () => {
    expect(formatTime(START, 'Africa/Lagos')).toBe('10:48 PM');
    expect(formatTime(START, 'America/New_York')).toBe('5:48 PM');
    expect(formatDayTime(START, 'Africa/Lagos')).toBe('Sat, 31 Oct · 10:48 PM');
  });

  it('moves the date when the zone crosses midnight', () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Lagos.
    expect(dateStamp('2026-10-31T23:30:00.000Z', 'Africa/Lagos')).toEqual({ month: 'NOV', day: '1' });
    expect(dateStamp('2026-10-31T23:30:00.000Z', 'UTC')).toEqual({ month: 'OCT', day: '31' });
  });

  it('reads midnight as 12 AM', () => {
    expect(formatTime('2026-10-31T23:00:00.000Z', 'Africa/Lagos')).toBe('12:00 AM');
  });

  it('falls back to the device’s zone for a missing or unknown zone', () => {
    expect(formatTime(START, 'Not/AZone')).toBe(formatTime(START));
    expect(formatTime(START, null)).toBe(formatTime(START));
  });

  it('says "this week" relative to the event’s own calendar', () => {
    const now = new Date('2026-10-29T12:00:00.000Z');
    expect(formatEventWhen(START, now, 'Africa/Lagos')).toBe('Sat, 10:48 PM');
    expect(formatEventWhen('2026-11-20T08:00:00.000Z', now, 'Africa/Lagos')).toBe('20 Nov, 9:00 AM');
  });

  it('formats one-day and multi-day ranges', () => {
    expect(formatEventRange('2026-11-21T08:00:00.000Z', '2026-11-21T16:00:00.000Z', 'Africa/Lagos')).toBe('Sat, 21 Nov · 9:00 AM to 5:00 PM');
    expect(formatEventRange(START, '2026-11-01T09:48:00.000Z', 'Africa/Lagos')).toBe('Sat, 31 Oct, 10:48 PM to Sun, 1 Nov, 10:48 AM');
    expect(formatEventRange(START, null, 'Africa/Lagos')).toBe('Sat, 31 Oct · 10:48 PM');
  });

  it('names the zone only when it differs from the device’s', () => {
    expect(timeZoneNote('Africa/Lagos', 'Africa/Lagos')).toBeNull();
    expect(timeZoneNote('Africa/Lagos', 'Europe/London')).toBe('Lagos time');
    expect(timeZoneNote('America/New_York', 'Africa/Lagos')).toBe('New York time');
    expect(timeZoneNote(null, 'Africa/Lagos')).toBeNull();
    expect(timeZoneNote('Not/AZone', 'Africa/Lagos')).toBeNull();
  });
});

describe('formatPrice', () => {
  it('says Free for 0, nothing without a price, and the amount otherwise', () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice({ amount: 0, currency: 'NGN' })).toBe('Free');
    expect(formatPrice({ amount: 100000, currency: 'NGN' })).toBe('₦100,000');
    expect(formatPrice({ amount: 12.5, currency: 'USD' })).toBe('$12.50');
  });
});

describe('hasPassed', () => {
  it('compares against now', () => {
    const now = new Date('2026-10-30T10:00:00.000Z');
    expect(hasPassed('2026-10-30T09:48:00.000Z', now)).toBe(true);
    expect(hasPassed('2026-10-30T10:30:00.000Z', now)).toBe(false);
  });
});

describe('formatRelativeTime', () => {
  const baseTime = new Date('2026-10-31T12:00:00.000Z').getTime();

  it('formats very recent posts as "Just now"', () => {
    // Exact same time
    expect(formatRelativeTime('2026-10-31T12:00:00.000Z', baseTime)).toBe('Just now');
    // Future (clock skew)
    expect(formatRelativeTime('2026-10-31T12:00:05.000Z', baseTime)).toBe('Just now');
    // 1.5 seconds ago (< 2000ms)
    expect(formatRelativeTime(new Date(baseTime - 1500).toISOString(), baseTime)).toBe('Just now');
  });

  it('formats seconds ago correctly', () => {
    expect(formatRelativeTime(new Date(baseTime - 2000).toISOString(), baseTime)).toBe('2 seconds ago');
    expect(formatRelativeTime(new Date(baseTime - 10_000).toISOString(), baseTime)).toBe('10 seconds ago');
    expect(formatRelativeTime(new Date(baseTime - 50_000).toISOString(), baseTime)).toBe('50 seconds ago');
    expect(formatRelativeTime(new Date(baseTime - 59_000).toISOString(), baseTime)).toBe('59 seconds ago');
  });

  it('formats minutes ago correctly', () => {
    expect(formatRelativeTime(new Date(baseTime - 60_000).toISOString(), baseTime)).toBe('1 minute ago');
    expect(formatRelativeTime(new Date(baseTime - 2 * 60_000).toISOString(), baseTime)).toBe('2 minutes ago');
    expect(formatRelativeTime(new Date(baseTime - 5 * 60_000).toISOString(), baseTime)).toBe('5 minutes ago');
    expect(formatRelativeTime(new Date(baseTime - 59 * 60_000).toISOString(), baseTime)).toBe('59 minutes ago');
  });

  it('formats hours ago correctly', () => {
    expect(formatRelativeTime(new Date(baseTime - 3600_000).toISOString(), baseTime)).toBe('1 hour ago');
    expect(formatRelativeTime(new Date(baseTime - 2 * 3600_000).toISOString(), baseTime)).toBe('2 hours ago');
    expect(formatRelativeTime(new Date(baseTime - 23 * 3600_000).toISOString(), baseTime)).toBe('23 hours ago');
  });

  it('formats days ago up to 6 days', () => {
    expect(formatRelativeTime(new Date(baseTime - 86400_000).toISOString(), baseTime)).toBe('1 day ago');
    expect(formatRelativeTime(new Date(baseTime - 3 * 86400_000).toISOString(), baseTime)).toBe('3 days ago');
    expect(formatRelativeTime(new Date(baseTime - 6 * 86400_000).toISOString(), baseTime)).toBe('6 days ago');
  });

  it('formats older dates as day and month', () => {
    // 10 days ago (21 Oct 2026)
    expect(formatRelativeTime(new Date(baseTime - 10 * 86400_000).toISOString(), baseTime)).toBe('21 Oct');
  });

  it('includes year for dates in previous years', () => {
    expect(formatRelativeTime('2025-10-21T12:00:00.000Z', baseTime)).toBe('21 Oct 2025');
  });

  it('handles empty and invalid timestamps gracefully', () => {
    expect(formatRelativeTime(null, baseTime)).toBe('');
    expect(formatRelativeTime(undefined, baseTime)).toBe('');
    expect(formatRelativeTime('', baseTime)).toBe('');
    expect(formatRelativeTime('invalid-date', baseTime)).toBe('');
  });

  it('formatAge delegates to formatRelativeTime', () => {
    expect(formatAge(new Date(baseTime - 10_000).toISOString(), baseTime)).toBe('10 seconds ago');
    expect(formatAge(new Date(baseTime - 2 * 60_000).toISOString(), baseTime)).toBe('2 minutes ago');
  });
});
