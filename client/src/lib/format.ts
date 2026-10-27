const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));
export const formatFull = (iso: string) => fullFormat.format(new Date(iso));

/** "Today", "Yesterday" or "Monday, Oct 26" – used for date dividers. */
export function formatDay(iso: string): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return dayFormat.format(new Date(iso));
}

/** Compact timestamp for conversation previews: "14:05", "Yesterday", "Oct 26". */
export function formatShort(iso: string): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
  if (days === 0) return formatTime(iso);
  if (days === 1) return 'Yesterday';
  return shortDateFormat.format(new Date(iso));
}

/** "just now", "5 minutes ago", "yesterday", … */
export function formatRelative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (Math.abs(diff) < MINUTE) return 'just now';
  if (Math.abs(diff) < HOUR) return relativeFormat.format(Math.round(diff / MINUTE), 'minute');
  if (Math.abs(diff) < DAY) return relativeFormat.format(Math.round(diff / HOUR), 'hour');
  return relativeFormat.format(Math.round(diff / DAY), 'day');
}

export const isSameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

/** Stable colour per user, derived from their id. */
export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 65% 45%)`;
}
