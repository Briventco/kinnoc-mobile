import { dateStamp, formatDayTime, formatEventRange, formatEventWhen, formatPrice, formatTime, hasPassed, timeZoneNote } from '../format';

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
