const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const shortDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const shortDateWithYear = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export type DateInput = string | number | Date;

/**
 * Compact relative time for activity feeds and tables:
 * "just now", "3 min ago", "5 hr ago", "yesterday", "4 days ago", then "Nov 18"
 * (with the year when it differs). Future times read "in 3 min".
 */
export function formatRelativeTime(value: DateInput, now: number = Date.now()): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const diff = now - time;
  const future = diff < 0;
  const elapsed = Math.abs(diff);
  const phrase = (amount: string) => (future ? `in ${amount}` : `${amount} ago`);

  if (elapsed < 45_000) {
    return future ? 'in a moment' : 'just now';
  }
  if (elapsed < HOUR) {
    return phrase(`${Math.max(1, Math.round(elapsed / MINUTE))} min`);
  }
  if (elapsed < DAY) {
    return phrase(`${Math.round(elapsed / HOUR)} hr`);
  }
  if (!future && elapsed < 2 * DAY) {
    return 'yesterday';
  }
  if (elapsed < 7 * DAY) {
    return phrase(`${Math.round(elapsed / DAY)} days`);
  }
  const date = new Date(time);
  return date.getFullYear() === new Date(now).getFullYear()
    ? shortDate.format(date)
    : shortDateWithYear.format(date);
}

/** "Nov 21, 2026, 9:03 AM" in the viewer's time zone. */
export function formatAbsoluteTime(value: DateInput): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : absolute.format(date);
}

const absoluteDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

/** "Nov 21, 2026". */
export function formatAbsoluteDate(value: DateInput): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : absoluteDate.format(date);
}
