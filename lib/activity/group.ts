/**
 * groupActivityByDay — bucket a sorted activity feed into day groups so the
 * timeline reads as a story (Today / Yesterday / Monday / March 3) instead of
 * one undifferentiated divide-y list.
 *
 * The feed arrives already sorted occurredAt-descending from the API; this
 * preserves that order, walks it once, and starts a new group each time the
 * LOCAL calendar day changes. Day boundaries and the relative labels (Today /
 * Yesterday / weekday) are computed against the viewer's local clock — `now` is
 * injectable so the labelling is deterministic under test.
 *
 * Pure + dependency-light (only the item type): unit-testable, no React.
 */

import type { UnifiedActivityItem } from './types';

export interface ActivityDayGroup {
  /** Stable local-day key (YYYY-M-D) for React keys. */
  key: string;
  /** Human header: 'Today' | 'Yesterday' | 'Monday' | 'March 3' | 'March 3, 2024'. */
  label: string;
  items: UnifiedActivityItem[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** Local-day key for a date — collapses time-of-day so same-day items group. */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Whole-day distance between two local calendar days (a − b), ignoring time. */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / 86_400_000);
}

/** The relative header label for a day, viewed from `now`. */
export function dayLabel(d: Date, now: Date): string {
  const diff = dayDiff(now, d); // days in the past (0 = today)
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  const monthDay = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear()
    ? monthDay
    : `${monthDay}, ${d.getFullYear()}`;
}

export function groupActivityByDay(
  items: UnifiedActivityItem[],
  now: Date = new Date(),
): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  let current: ActivityDayGroup | null = null;

  for (const item of items) {
    const d = new Date(item.occurredAt);
    // A malformed timestamp shouldn't crash the feed — drop it into an
    // "Earlier" bucket rather than throwing.
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? localDayKey(d) : 'unknown';

    if (!current || current.key !== key) {
      current = {
        key,
        label: valid ? dayLabel(d, now) : 'Earlier',
        items: [],
      };
      groups.push(current);
    }
    current.items.push(item);
  }

  return groups;
}
