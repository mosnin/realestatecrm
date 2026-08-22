/**
 * Worker schedule ↔ app manifest parity.
 *
 * The always-on worker (worker/src/schedule.ts) is the primary production scheduler.
 * Vercel independently invokes only the three idempotent recovery routes so a
 * stale worker deployment cannot strand user work. The app's
 * CRON_MANIFEST (lib/inngest/cron-functions.ts) remains the app-side record
 * of those jobs (ids, routes, cadences, Sentry monitor expectations). This
 * test pins the two lists together so a job added, dropped, or re-scheduled
 * on one side fails CI loudly — the silent-drift failure mode that left
 * scheduled jobs dead in production before.
 */

import { describe, it, expect } from 'vitest';
import { RECURRING_JOBS } from '../../worker/src/schedule';
import { CRON_MANIFEST } from '@/lib/inngest/cron-functions';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('worker recurring jobs', () => {
  it('match the app manifest exactly — same ids, routes, and cadences', () => {
    const fromWorker = new Map(RECURRING_JOBS.map((j) => [j.id, j]));
    const fromApp = new Map(CRON_MANIFEST.map((e) => [e.id, e]));

    for (const [id, entry] of fromApp) {
      const w = fromWorker.get(id);
      expect(w, `worker schedule is missing job ${id}`).toBeDefined();
      expect(w!.path, `route drift for ${id}`).toBe(entry.path);
      expect(w!.pattern, `cadence drift for ${id}`).toBe(entry.cron);
    }
    for (const id of fromWorker.keys()) {
      expect(fromApp.has(id), `worker schedules unknown job ${id}`).toBe(true);
    }
    expect(fromWorker.size).toBe(fromApp.size);
  });

  it('every scheduled route exists as a real route file', () => {
    for (const { path } of RECURRING_JOBS) {
      const routeFile = join(process.cwd(), 'app', ...path.split('/').filter(Boolean), 'route.ts');
      expect(() => readFileSync(routeFile), `${path} has no route.ts`).not.toThrow();
    }
  });

  it('keeps an exact Vercel safety rail for the three idempotent recovery routes', () => {
    const vercelJson = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    const recoveryIds = [
      'cron-workspace-run-recovery',
      'cron-work-session-action-recovery',
      'cron-conversation-turn-recovery',
    ];
    const expected = recoveryIds.map((id) => {
      const job = RECURRING_JOBS.find((entry) => entry.id === id);
      expect(job, `worker schedule is missing recovery job ${id}`).toBeDefined();
      return { path: job!.path, schedule: job!.pattern };
    });

    expect(vercelJson.crons).toEqual(expected);
  });
});
