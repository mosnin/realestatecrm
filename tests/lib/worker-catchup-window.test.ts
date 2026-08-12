/**
 * The master tick's catch-up window (worker/src/cron-match.ts).
 *
 * Cloudflare scheduled triggers are best-effort. With exact-instant matching a
 * daily `0 9 * * *` job whose 09:00 tick lands at 09:01 NEVER RUNS THAT DAY —
 * silently. Window matching fixes that; these tests pin both that it recovers
 * missed slots AND that consecutive windows can't double-fire the same slot.
 */

import { describe, it, expect } from 'vitest';
import { cronMatchesInWindow, cronMatches } from '../../worker/src/cron-match';
import { RECURRING_JOBS } from '../../worker/src/schedule';

const t = (iso: string) => new Date(iso);
/** The window a tick at `now` covers with no KV watermark (5-minute cadence). */
const defaultWindow = (now: string) => ({
  from: new Date(t(now).getTime() - 5 * 60_000),
  to: t(now),
});

describe('cronMatchesInWindow', () => {
  it('recovers a daily job when its tick is DELAYED past the exact minute', () => {
    // 09:00 daily job; the master tick actually fires at 09:03.
    expect(cronMatches('0 9 * * *', t('2026-08-10T09:03:00Z'))).toBe(false); // old behavior: dropped
    const w = defaultWindow('2026-08-10T09:03:00Z');
    expect(cronMatchesInWindow('0 9 * * *', w.from, w.to)).toBe(true); // recovered
  });

  it('recovers a whole missed gap when a watermark widens the window', () => {
    // Trigger stopped for 3 hours; next tick's window spans the outage.
    expect(
      cronMatchesInWindow('0 9 * * *', t('2026-08-10T07:30:00Z'), t('2026-08-10T10:30:00Z')),
    ).toBe(true);
  });

  it('consecutive windows are half-open — no slot fires twice', () => {
    const a = defaultWindow('2026-08-10T09:00:00Z'); // (08:55, 09:00]
    const b = defaultWindow('2026-08-10T09:05:00Z'); // (09:00, 09:05]
    expect(cronMatchesInWindow('0 9 * * *', a.from, a.to)).toBe(true);
    expect(cronMatchesInWindow('0 9 * * *', b.from, b.to)).toBe(false);
  });

  it('does not fire a job whose slot is not in the window', () => {
    const w = defaultWindow('2026-08-10T14:05:00Z');
    expect(cronMatchesInWindow('0 9 * * *', w.from, w.to)).toBe(false);
  });

  it('a job matching many slots in a long window still reports once', () => {
    // */15 over 3 hours = 12 slots; the caller enqueues ONE catch-up run.
    expect(
      cronMatchesInWindow('*/15 * * * *', t('2026-08-10T06:00:00Z'), t('2026-08-10T09:00:00Z')),
    ).toBe(true);
  });

  it('weekly day-of-week jobs survive a delayed tick', () => {
    // 2026-08-10 is a Monday; broker-weekly-report is `0 9 * * 1`.
    const w = defaultWindow('2026-08-10T09:02:00Z');
    expect(cronMatchesInWindow('0 9 * * 1', w.from, w.to)).toBe(true);
    const tue = defaultWindow('2026-08-11T09:02:00Z');
    expect(cronMatchesInWindow('0 9 * * 1', tue.from, tue.to)).toBe(false);
  });
});

describe('every real recurring job survives a delayed tick', () => {
  it('each job fires within a 5-minute window that contains its slot', () => {
    // Walk a full week of 5-minute ticks, but offset each tick by 2 minutes to
    // simulate a chronically-late trigger. Every job must still fire.
    const start = Date.UTC(2026, 7, 10, 0, 0, 0); // Monday
    const fired = new Set<string>();
    for (let m = 0; m < 7 * 24 * 60; m += 5) {
      const scheduled = new Date(start + m * 60_000);
      const from = new Date(scheduled.getTime() - 5 * 60_000);
      for (const job of RECURRING_JOBS) {
        if (cronMatchesInWindow(job.pattern, from, scheduled)) fired.add(job.id);
      }
    }
    const never = RECURRING_JOBS.filter((j) => !fired.has(j.id)).map((j) => j.id);
    expect(never, 'jobs that never fire on a late trigger').toEqual([]);
  });
});
