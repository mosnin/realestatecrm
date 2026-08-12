/**
 * Worker schedule ↔ app manifest parity.
 *
 * The always-on worker (worker/src/schedule.ts) is the production scheduler:
 * it keeps one BullMQ repeatable job per recurring background job. The app's
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

  it('vercel.json no longer declares crons (the worker owns scheduling)', () => {
    const vercelJson = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    expect(vercelJson.crons).toBeUndefined();
  });
});
