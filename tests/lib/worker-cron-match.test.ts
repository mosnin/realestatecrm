/**
 * The Cloudflare worker's cron matcher + schedule sanity.
 *
 * The worker runs ONE 5-minute master trigger and decides in code which recurring
 * jobs are due (worker/src/cron-match.ts). That makes two things
 * load-bearing: the matcher must be correct for every syntax the schedule
 * uses, and every schedule's minute field must align to 5-minute boundaries
 * (a job at minute 7 would fall between master ticks and silently never
 * run — the exact failure mode this architecture exists to end).
 */

import { describe, it, expect } from 'vitest';
import { cronMatches, parseCron } from '../../worker/src/cron-match';
import { RECURRING_JOBS } from '../../worker/src/schedule';

const at = (iso: string) => new Date(iso);

describe('cronMatches', () => {
  it('*/step minutes', () => {
    expect(cronMatches('*/15 * * * *', at('2026-08-10T14:00:00Z'))).toBe(true);
    expect(cronMatches('*/15 * * * *', at('2026-08-10T14:45:00Z'))).toBe(true);
    expect(cronMatches('*/15 * * * *', at('2026-08-10T14:50:00Z'))).toBe(false);
  });

  it('fixed minute + hour', () => {
    expect(cronMatches('30 16 * * *', at('2026-08-10T16:30:00Z'))).toBe(true);
    expect(cronMatches('30 16 * * *', at('2026-08-10T15:30:00Z'))).toBe(false);
    expect(cronMatches('30 16 * * *', at('2026-08-10T16:35:00Z'))).toBe(false);
  });

  it('hour steps', () => {
    expect(cronMatches('0 */4 * * *', at('2026-08-10T08:00:00Z'))).toBe(true);
    expect(cronMatches('0 */4 * * *', at('2026-08-10T09:00:00Z'))).toBe(false);
    expect(cronMatches('0 */4 * * *', at('2026-08-10T08:15:00Z'))).toBe(false);
  });

  it('day-of-week (Monday weekly report)', () => {
    // 2026-08-10 is a Monday.
    expect(cronMatches('0 9 * * 1', at('2026-08-10T09:00:00Z'))).toBe(true);
    expect(cronMatches('0 9 * * 1', at('2026-08-11T09:00:00Z'))).toBe(false);
  });

  it('comma lists', () => {
    expect(cronMatches('0,30 * * * *', at('2026-08-10T10:30:00Z'))).toBe(true);
    expect(cronMatches('0,30 * * * *', at('2026-08-10T10:15:00Z'))).toBe(false);
  });

  it('throws on unsupported syntax instead of silently never matching', () => {
    expect(() => parseCron('1-5 * * * *')).toThrow();
    expect(() => parseCron('* * *')).toThrow();
    expect(() => parseCron('99 * * * *')).toThrow();
  });
});

describe('recurring-job schedule sanity', () => {
  it('every pattern parses under the worker matcher', () => {
    for (const jobDef of RECURRING_JOBS) {
      expect(() => parseCron(jobDef.pattern), `${jobDef.id}: ${jobDef.pattern}`).not.toThrow();
    }
  });

  it('every minute field aligns to the */5 master tick', () => {
    // Simulate a full day of master ticks; every job must fire at least as
    // often as its own pattern implies (here: at least once in the day for
    // daily+ cadences, and never require a minute the master tick skips).
    for (const jobDef of RECURRING_JOBS) {
      let fired = 0;
      for (let m = 0; m < 24 * 60; m += 5) {
        const d = new Date(Date.UTC(2026, 7, 10, 0, 0, 0)); // Monday
        d.setUTCMinutes(m);
        if (cronMatches(jobDef.pattern, d)) fired++;
      }
      expect(fired, `${jobDef.id} (${jobDef.pattern}) never fires on */5 ticks`).toBeGreaterThan(0);
    }
  });

  it('minute-alignment guard: no pattern uses a minute the master tick skips', () => {
    for (const jobDef of RECURRING_JOBS) {
      const minuteField = jobDef.pattern.trim().split(/\s+/)[0];
      // Collect the minutes this pattern can fire at…
      const f = parseCron(jobDef.pattern);
      for (let minute = 0; minute < 60; minute++) {
        if (f.minute(minute)) {
          expect(minute % 5, `${jobDef.id}: minute ${minute} (field "${minuteField}") misses the */5 master tick`).toBe(0);
        }
      }
    }
  });
});
