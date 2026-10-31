/** Date and number formatting in the Kinnoc voice: day-first dates, "10:24 AM" times. */
import { randomUUID } from 'expo-crypto';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (from: Date, to: Date) => Math.round((startOfDay(to) - startOfDay(from)) / DAY);

/** Calendar fields of an instant, in a time zone. */
interface Wall {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

const zoneFormats = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormat(timeZone: string) {
  if (!zoneFormats.has(timeZone)) {
    let format: Intl.DateTimeFormat | null = null;
    try {
      format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });
    } catch {
      // An unknown zone: fall back to the device's.
    }
    zoneFormats.set(timeZone, format);
  }
  return zoneFormats.get(timeZone)!;
}

/** The instant's date and time in `timeZone` (an IANA zone), or in the device's zone without one. */
function wall(iso: string | Date, timeZone?: string | null): Wall {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const format = timeZone ? zoneFormat(timeZone) : null;
  if (format) {
    const p: Record<string, number> = {};
    for (const part of format.formatToParts(d)) if (part.type !== 'literal') p[part.type] = Number(part.value);
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return { year: p.year, month: p.month - 1, day: p.day, weekday, hour: p.hour % 24, minute: p.minute };
  }
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), weekday: d.getDay(), hour: d.getHours(), minute: d.getMinutes() };
}

const wallDayDiff = (from: Wall, to: Wall) => Math.round((Date.UTC(to.year, to.month, to.day) - Date.UTC(from.year, from.month, from.day)) / DAY);

/** "10:24 AM" */
export function formatTime(iso: string, timeZone?: string | null) {
  const { hour: h, minute } = wall(iso, timeZone);
  return `${h % 12 || 12}:${String(minute).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Sat, 24 Oct" */
export function formatDay(iso: string, timeZone?: string | null) {
  const w = wall(iso, timeZone);
  return `${DAYS[w.weekday]}, ${w.day} ${MONTHS[w.month]}`;
}

/** "Sat, 24 Oct · 10:00 AM" */
export function formatDayTime(iso: string, timeZone?: string | null) {
  return `${formatDay(iso, timeZone)} · ${formatTime(iso, timeZone)}`;
}

/** "Sat, 10:00 AM" for this week's events, else "24 Oct, 10:00 AM". */
export function formatEventWhen(iso: string, now = new Date(), timeZone?: string | null) {
  const w = wall(iso, timeZone);
  const diff = wallDayDiff(wall(now, timeZone), w);
  if (diff >= 0 && diff < 7) return `${DAYS[w.weekday]}, ${formatTime(iso, timeZone)}`;
  return `${w.day} ${MONTHS[w.month]}, ${formatTime(iso, timeZone)}`;
}

/**
 * An event's dates on the detail screen, in its zone: "Sat, 21 Nov · 9:00 AM to 5:00 PM" on one
 * day, else "Sat, 21 Nov, 9:00 AM to Mon, 23 Nov, 5:00 PM".
 */
export function formatEventRange(startsAt: string, endsAt: string | null, timeZone?: string | null) {
  if (!endsAt) return formatDayTime(startsAt, timeZone);
  const a = wall(startsAt, timeZone);
  const b = wall(endsAt, timeZone);
  if (wallDayDiff(a, b) === 0) return `${formatDayTime(startsAt, timeZone)} to ${formatTime(endsAt, timeZone)}`;
  return `${formatDay(startsAt, timeZone)}, ${formatTime(startsAt, timeZone)} to ${formatDay(endsAt, timeZone)}, ${formatTime(endsAt, timeZone)}`;
}

/** The device's IANA zone, when the platform reports one. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/**
 * "Lagos time" when an event's zone differs from the device's, so a reader abroad knows the
 * times are local to the event. Null when they match, or the zone is unknown.
 */
export function timeZoneNote(timeZone: string | null, device = deviceTimeZone()) {
  if (!timeZone || timeZone === device || !zoneFormat(timeZone)) return null;
  const place = timeZone.split('/').pop()!.replace(/_/g, ' ');
  return `${place} time`;
}

/** "₦5,000", "Free", or null when no price was given. */
export function formatPrice(price: { amount: number; currency: string } | null) {
  if (!price) return null;
  if (price.amount === 0) return 'Free';
  const fraction = Number.isInteger(price.amount) ? 0 : 2;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: price.currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(price.amount);
  } catch {
    return `${price.currency} ${price.amount.toLocaleString('en-NG')}`;
  }
}

/** { month: "OCT", day: "24" } for date stamps. */
export function dateStamp(iso: string, timeZone?: string | null) {
  const w = wall(iso, timeZone);
  return { month: MONTHS[w.month].toUpperCase(), day: String(w.day) };
}

/**
 * Relative timestamp formatting:
 * - < 2s: "Just now"
 * - < 60s: "X seconds ago" (or "1 second ago")
 * - < 60m: "X minutes ago" (or "1 minute ago")
 * - < 24h: "X hours ago" (or "1 hour ago")
 * - < 7d: "X days ago" (or "1 day ago")
 * - >= 7d: "D Mon" (e.g. "24 Oct"), or "D Mon YYYY" if another year.
 */
export function formatRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '';

  const ms = now - timestamp;
  if (ms < 2000) return 'Just now';

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} ${sec === 1 ? 'second' : 'seconds'} ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;

  const d = new Date(timestamp);
  const nowYear = new Date(now).getFullYear();
  if (d.getFullYear() === nowYear) {
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Feed and notification ages. Uses formatRelativeTime for continuous live precision. */
export function formatAge(iso: string, now = Date.now()): string {
  return formatRelativeTime(iso, now);
}

/** Longer ages for notifications: "12 min ago", "1 hour ago", "Yesterday", "Fri". */
export function formatAgeLong(iso: string, now = new Date()) {
  const d = new Date(iso);
  const ms = now.getTime() - d.getTime();
  if (ms < MIN) return 'Just now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  const days = dayDiff(d, now);
  if (days === 0) {
    const h = Math.floor(ms / HOUR);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Inbox times: "10:24 AM" today, "Yesterday", weekday this week, else "24 Oct". */
export function formatInboxTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const days = dayDiff(d, now);
  if (days <= 0) return formatTime(iso);
  if (days === 1) return 'Yesterday';
  if (days < 7) return DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Chat date separators: "Today", "Yesterday", "Sat, 24 Oct". */
export function formatDateSeparator(iso: string, now = new Date()) {
  const days = dayDiff(new Date(iso), now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatDay(iso);
}

export const isSameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

/** True once the instant is behind us: a closed registration deadline, say. */
export const hasPassed = (iso: string, now = new Date()) => Date.parse(iso) < now.getTime();

/** Whole days until a deadline (0 = today). Negative once passed. */
export function daysUntil(iso: string, now = new Date()) {
  return dayDiff(now, new Date(iso));
}

/**
 * Deadline label parts. Within three days it is urgent and reads "CLOSES IN 3 DAYS"
 * (shown in warning); otherwise "CLOSES 15 NOV".
 */
export function deadlineLabel(iso: string, now = new Date()): { text: string; urgent: boolean; closed: boolean } {
  const days = daysUntil(iso, now);
  if (days < 0) return { text: 'Closed', urgent: false, closed: true };
  if (days === 0) return { text: 'Closes today', urgent: true, closed: false };
  if (days === 1) return { text: 'Closes tomorrow', urgent: true, closed: false };
  if (days <= 3) return { text: `Closes in ${days} days`, urgent: true, closed: false };
  const d = new Date(iso);
  return { text: `Closes ${d.getDate()} ${MONTHS[d.getMonth()]}`, urgent: false, closed: false };
}

/** "248 members", "1.2K members" */
export function formatCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${Math.round(n / 1000)}K`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** First letters of up to two words: "Deborah A." → "DA". */
export function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** A random UUID (v4): message idempotency keys and unguessable upload names. */
export const uid = () => randomUUID();
