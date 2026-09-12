import { describe, expect, it } from 'vitest';
import {
  actionRetention,
  type ActionReceipt,
} from '@/lib/analytics/action-retention';
const day = 86_400_000;
const start = Date.parse('2026-08-03T12:00:00Z');
const row = (
  spaceId: string,
  offset: number,
  outcome = 'completed',
): ActionReceipt => ({
  spaceId,
  createdAt: new Date(start + offset * day).toISOString(),
  payload: { outcome },
});
describe('Repeat useful work', () => {
  it('counts distinct workspaces and fully elapsed windows, excluding drafts and failures', () => {
    const result = actionRetention(
      [
        row('a', 0),
        row('a', 0),
        row('a', 7),
        row('a', 28),
        row('b', 0),
        row('b', 8, 'drafted'),
        row('c', 0, 'failed'),
      ],
      new Date(start + 35 * day),
    );
    expect(result).toEqual([
      {
        week: '2026-08-03',
        activated: 2,
        week2Eligible: 2,
        week2Repeat: 1,
        week5Eligible: 2,
        week5Repeat: 1,
      },
    ]);
  });
  it('does not penalize cohorts with open windows or include the next window boundary', () => {
    const result = actionRetention(
      [row('a', 0), row('a', 14), row('a', 35)],
      new Date(start + 34 * day),
    );
    expect(result[0]).toMatchObject({
      week2Eligible: 1,
      week2Repeat: 0,
      week5Eligible: 0,
    });
    expect(
      actionRetention([row('a', 0), row('a', 7)], new Date(start + 13 * day))[0]
        .week2Eligible,
    ).toBe(0);
  });
});
