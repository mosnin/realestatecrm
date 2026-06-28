/**
 * Unit tests for groupActivityByDay / dayLabel — the pure day-bucketing that
 * turns the flat activity feed into a Today / Yesterday / weekday story.
 *
 * Dates are built relative to a fixed `now` WITHOUT a 'Z' suffix so they parse
 * in the test runner's local zone — the same zone the grouping reads — keeping
 * the calendar-day math deterministic regardless of where CI runs.
 */

import { describe, it, expect } from 'vitest';
import { groupActivityByDay, dayLabel } from '@/lib/activity/group';
import type { UnifiedActivityItem } from '@/lib/activity/types';

const NOW = new Date('2026-06-28T12:00:00'); // a Sunday, local

function item(id: string, occurredAt: string): UnifiedActivityItem {
  return {
    id,
    source: 'agentActivityLog',
    kind: 'agent_action',
    title: id,
    status: 'success',
    tone: 'green',
    occurredAt,
  } satisfies UnifiedActivityItem;
}

describe('dayLabel', () => {
  it('labels today / yesterday relatively', () => {
    expect(dayLabel(new Date('2026-06-28T09:00:00'), NOW)).toBe('Today');
    expect(dayLabel(new Date('2026-06-27T23:00:00'), NOW)).toBe('Yesterday');
  });

  it('labels 2–6 days ago by weekday name', () => {
    // 2026-06-25 is a Thursday
    expect(dayLabel(new Date('2026-06-25T10:00:00'), NOW)).toBe('Thursday');
  });

  it('labels older same-year days as Month D, and prior years with the year', () => {
    expect(dayLabel(new Date('2026-03-03T10:00:00'), NOW)).toBe('March 3');
    expect(dayLabel(new Date('2025-12-31T10:00:00'), NOW)).toBe('December 31, 2025');
  });
});

describe('groupActivityByDay', () => {
  it('buckets a descending feed into ordered day groups, preserving item order', () => {
    const items = [
      item('a', '2026-06-28T11:00:00'),
      item('b', '2026-06-28T09:00:00'),
      item('c', '2026-06-27T20:00:00'),
      item('d', '2026-06-25T08:00:00'),
    ];
    const groups = groupActivityByDay(items, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Thursday']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['c']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d']);
  });

  it('returns no groups for an empty feed', () => {
    expect(groupActivityByDay([], NOW)).toEqual([]);
  });

  it('does not crash on a malformed timestamp — buckets it as Earlier', () => {
    const groups = groupActivityByDay([item('x', 'not-a-date')], NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Earlier');
    expect(groups[0].items[0].id).toBe('x');
  });

  it('keeps same-day items together even across a new group boundary', () => {
    // Interleaved-looking but still descending: two today, one older, (no return to today)
    const items = [
      item('a', '2026-06-28T11:00:00'),
      item('b', '2026-06-28T01:00:00'),
      item('c', '2026-06-20T10:00:00'),
    ];
    const groups = groupActivityByDay(items, NOW);
    expect(groups).toHaveLength(2);
    expect(groups[0].items).toHaveLength(2);
  });
});
