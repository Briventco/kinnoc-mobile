/** Date and number formatting in the Kinnoc voice: day-first dates, "10:24 AM" times. */
import { randomUUID } from 'expo-crypto';


const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (from: Date, to: Date) => Math.round((startOfDay(to) - startOfDay(from)) / DAY);

/** "10:24 AM" */
export function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Sat, 24 Oct" */
export function formatDay(iso: string) {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sat, 24 Oct · 10:00 AM" */
export function formatDayTime(iso: string) {
  return `${formatDay(iso)} · ${formatTime(iso)}`;
}

/** "Sat, 10:00 AM" for this week's events, else "24 Oct, 10:00 AM". */
export function formatEventWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  const diff = dayDiff(now, d);
  if (diff >= 0 && diff < 7) return `${DAYS[d.getDay()]}, ${formatTime(iso)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${formatTime(iso)}`;
}

/** { month: "OCT", day: "24" } for date stamps. */
export function dateStamp(iso: string) {
  const d = new Date(iso);
  return { month: MONTHS[d.getMonth()].toUpperCase(), day: String(d.getDate()) };
}

/** Feed and notification ages: "now", "12m", "3h", "2d", then "24 Oct". */
export function formatAge(iso: string, now = Date.now()) {
  const ms = now - new Date(iso).getTime();
  if (ms < MIN) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`;
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}d`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
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
