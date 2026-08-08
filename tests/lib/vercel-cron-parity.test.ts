/**
 * Vercel cron ↔ CRON_MANIFEST parity.
 *
 * Production scheduling runs on vercel.json's `crons` array; the Inngest
 * mirrors in lib/inngest/cron-functions.ts share the same manifest. This test
 * pins the two together so a cron added, dropped, or re-scheduled in one
 * place fails loudly instead of silently drifting — the exact failure mode
 * that left scheduled jobs dead after the original cutover.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CRON_MANIFEST } from '@/lib/inngest/cron-functions';

interface VercelCron {
  path: string;
  schedule: string;
}

const vercelJson = JSON.parse(
  readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons?: VercelCron[] };

describe('vercel.json crons', () => {
  it('declares a crons array (the production scheduler)', () => {
    expect(Array.isArray(vercelJson.crons)).toBe(true);
    expect(vercelJson.crons!.length).toBeGreaterThan(0);
  });

  it('matches CRON_MANIFEST exactly — same paths, same schedules, nothing extra', () => {
    const fromVercel = new Map(vercelJson.crons!.map((c) => [c.path, c.schedule]));
    const fromManifest = new Map(CRON_MANIFEST.map((e) => [e.path, e.cron]));

    // Every manifest entry is scheduled on Vercel with the identical crontab.
    for (const [path, cron] of fromManifest) {
      expect(fromVercel.get(path), `vercel.json is missing or drifted for ${path}`).toBe(cron);
    }
    // And Vercel schedules nothing the manifest doesn't know about.
    for (const path of fromVercel.keys()) {
      expect(fromManifest.has(path), `vercel.json schedules unknown route ${path}`).toBe(true);
    }
    expect(fromVercel.size).toBe(fromManifest.size);
  });

  it('every scheduled path has a real route file', () => {
    for (const { path } of vercelJson.crons!) {
      const routeFile = join(process.cwd(), 'app', ...path.split('/').filter(Boolean), 'route.ts');
      expect(() => readFileSync(routeFile), `${path} has no route.ts`).not.toThrow();
    }
  });
});
