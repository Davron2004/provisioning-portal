import { formatAbsoluteTime, formatRelativeTime } from './format-time';

const NOW = Date.parse('2026-11-21T15:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [ago(10_000), 'just now'],
    [ago(50_000), '1 min ago'],
    [ago(3 * MIN), '3 min ago'],
    [ago(59 * MIN), '59 min ago'],
    [ago(2 * HOUR), '2 hr ago'],
    [ago(30 * HOUR), 'yesterday'],
    [ago(4 * DAY), '4 days ago'],
  ])('formats %s as "%s"', (value, expected) => {
    expect(formatRelativeTime(value, NOW)).toBe(expected);
  });

  it('shows a date after a week, with the year only when it differs', () => {
    expect(formatRelativeTime('2026-11-02T12:00:00Z', NOW)).toBe('Nov 2');
    expect(formatRelativeTime('2025-06-15T12:00:00Z', NOW)).toBe('Jun 15, 2025');
  });

  it('handles future times', () => {
    expect(formatRelativeTime(NOW + 5 * MIN, NOW)).toBe('in 5 min');
    expect(formatRelativeTime(NOW + 10_000, NOW)).toBe('in a moment');
  });

  it('returns an empty string for invalid dates', () => {
    expect(formatRelativeTime('not a date', NOW)).toBe('');
    expect(formatAbsoluteTime('not a date')).toBe('');
  });
});

describe('formatAbsoluteTime', () => {
  it('includes the date and time', () => {
    const text = formatAbsoluteTime('2026-11-21T15:00:00Z');
    expect(text).toMatch(/Nov 2\d, 2026/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });
});
