/**
 * Tests for lib/inngest/cron-functions.ts — the Inngest replacement for the
 * removed vercel.json `crons` array.
 *
 * Locks in:
 *   - The manifest carries every schedule vercel.json declared at cutover
 *     (hardcoded expected map — a dropped or drifted schedule fails loudly),
 *     and each Inngest function is registered with that exact cron trigger,
 *     a stable id, and bounded retries.
 *   - A tick invokes the existing route handler's GET with a request carrying
 *     `Authorization: Bearer ${CRON_SECRET}` and returns the route's JSON body
 *     and status as the function output.
 *   - A non-2xx route response throws (so Inngest retries / marks the run
 *     failed) instead of being swallowed as a success.
 *   - INNGEST_CRONS_DISABLED short-circuits before the route module is even
 *     loaded.
 *
 * We invoke each function's handler directly (the same shape Inngest calls);
 * the Inngest runtime itself is not under test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Inngest client stub — capture config + handler so tests can inspect the
// registered trigger and drive the handler directly.
vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
    send: vi.fn(),
  },
}));

// Route-module mock for the one route the behavioral tests exercise. The
// manifest loads route modules lazily, so the other 19 are never imported.
const { routinesGetMock } = vi.hoisted(() => ({
  routinesGetMock: vi.fn(),
}));
vi.mock('@/app/api/cron/routines/route', () => ({ GET: routinesGetMock }));

import { CRON_MANIFEST, cronFunctions } from '@/lib/inngest/cron-functions';
import type { NextRequest } from 'next/server';

// The exact `crons` array vercel.json carried at cutover (path → schedule).
// Hardcoded on purpose: this test is the record that no schedule was dropped
// or silently changed during the migration.
const EXPECTED: Array<{ id: string; path: string; cron: string }> = [
  { id: 'cron-lead-sla', path: '/api/cron/lead-sla', cron: '*/15 * * * *' },
  { id: 'cron-follow-up-reminders', path: '/api/cron/follow-up-reminders', cron: '0 9 * * *' },
  {
    id: 'cron-deal-checklist-reminders',
    path: '/api/cron/deal-checklist-reminders',
    cron: '0 8 * * *',
  },
  { id: 'cron-tour-reminders', path: '/api/cron/tour-reminders', cron: '*/15 * * * *' },
  { id: 'cron-broker-weekly-report', path: '/api/cron/broker-weekly-report', cron: '0 9 * * 1' },
  { id: 'cron-agent-sweep', path: '/api/cron/agent-sweep', cron: '0 */4 * * *' },
  { id: 'cron-agent-run-reconcile', path: '/api/cron/agent-run-reconcile', cron: '*/15 * * * *' },
  { id: 'cron-agent-tasks', path: '/api/cron/agent-tasks', cron: '*/15 * * * *' },
  { id: 'cron-workspace-run-recovery', path: '/api/cron/workspace-run-recovery', cron: '*/5 * * * *' },
  { id: 'cron-work-session-action-recovery', path: '/api/cron/work-session-action-recovery', cron: '*/5 * * * *' },
  { id: 'cron-conversation-turn-recovery', path: '/api/cron/conversation-turn-recovery', cron: '*/5 * * * *' },
  { id: 'cron-routines', path: '/api/cron/routines', cron: '0 * * * *' },
  { id: 'cron-workflows', path: '/api/cron/workflows', cron: '0 * * * *' },
  { id: 'cron-scheduled-messages', path: '/api/cron/scheduled-messages', cron: '*/15 * * * *' },
  { id: 'cron-broker-routines', path: '/api/cron/broker-routines', cron: '0 * * * *' },
  { id: 'cron-draft-outcomes', path: '/api/cron/draft-outcomes', cron: '0 3 * * *' },
  { id: 'cron-sweep-paused-runs', path: '/api/cron/sweep-paused-runs', cron: '0 4 * * *' },
  { id: 'cron-cleanup', path: '/api/cron/cleanup', cron: '0 3 * * *' },
  { id: 'cron-storage-gc', path: '/api/cron/storage-gc', cron: '0 5 * * *' },
  { id: 'cron-seat-reconcile', path: '/api/cron/seat-reconcile', cron: '30 4 * * *' },
  { id: 'cron-daily-briefing', path: '/api/cron/daily-briefing', cron: '0 * * * *' },
  { id: 'cron-notification-digest', path: '/api/cron/notification-digest', cron: '0 8 * * *' },
  { id: 'cron-next-moves', path: '/api/cron/next-moves', cron: '0 10 * * *' },
  {
    id: 'cron-extraction-backfill',
    path: '/api/cron/extraction-backfill',
    cron: '15 * * * *',
  },
  { id: 'cron-review-nudge', path: '/api/cron/review-nudge', cron: '30 16 * * *' },
  { id: 'cron-drip-tick', path: '/api/drip/tick', cron: '*/30 * * * *' },
];

// Shape produced by the mocked inngest.createFunction above.
interface CapturedFunction {
  config: { id: string; retries: number; triggers: Array<{ cron: string }> };
  handler: () => Promise<unknown>;
}

function fnById(id: string): CapturedFunction {
  const fn = (cronFunctions as unknown as CapturedFunction[]).find((f) => f.config.id === id);
  expect(fn, `expected a cron function with id "${id}"`).toBeTruthy();
  return fn!;
}

let savedSecret: string | undefined;
let savedDisabled: string | undefined;

beforeEach(() => {
  savedSecret = process.env.CRON_SECRET;
  savedDisabled = process.env.INNGEST_CRONS_DISABLED;
  process.env.CRON_SECRET = 'test-cron-secret';
  delete process.env.INNGEST_CRONS_DISABLED;
  routinesGetMock.mockReset();
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
  if (savedDisabled === undefined) delete process.env.INNGEST_CRONS_DISABLED;
  else process.env.INNGEST_CRONS_DISABLED = savedDisabled;
});

describe('cron manifest — parity with the removed vercel.json crons array', () => {
  it('carries every schedule vercel.json declared, byte-identical', () => {
    expect(CRON_MANIFEST.length).toBe(EXPECTED.length);
    for (const exp of EXPECTED) {
      const entry = CRON_MANIFEST.find((e) => e.path === exp.path);
      expect(entry, `expected a manifest entry for ${exp.path}`).toBeTruthy();
      expect(entry!.id).toBe(exp.id);
      expect(entry!.cron).toBe(exp.cron);
    }
  });

  it('registers one Inngest function per entry with the same cron trigger, a stable id, and bounded retries', () => {
    expect(cronFunctions.length).toBe(EXPECTED.length);
    for (const exp of EXPECTED) {
      const fn = fnById(exp.id);
      expect(fn.config.triggers).toEqual([{ cron: exp.cron }]);
      expect(fn.config.retries).toBe(2);
    }
    // ids are unique — a duplicate would silently collapse two schedules.
    const ids = (cronFunctions as unknown as CapturedFunction[]).map((f) => f.config.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cron function tick behavior', () => {
  it('invokes the route GET with Bearer CRON_SECRET and returns the JSON body on 200', async () => {
    routinesGetMock.mockResolvedValue(
      new Response(JSON.stringify({ due: 3, fired: 3, skipped: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await fnById('cron-routines').handler();

    expect(routinesGetMock).toHaveBeenCalledTimes(1);
    const req = routinesGetMock.mock.calls[0][0] as NextRequest;
    expect(req.headers.get('Authorization')).toBe('Bearer test-cron-secret');
    expect(new URL(req.url).pathname).toBe('/api/cron/routines');
    expect(req.method).toBe('GET');

    expect(result).toEqual({ status: 200, body: { due: 3, fired: 3, skipped: 0 } });
  });

  it('throws on a non-2xx route response so Inngest retries', async () => {
    routinesGetMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'DB query failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fnById('cron-routines').handler()).rejects.toThrow(
      /\/api\/cron\/routines returned 500/,
    );
    // The route's own error body is surfaced in the thrown message so the
    // Inngest run history shows WHY the tick failed.
    routinesGetMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    );
    await expect(fnById('cron-routines').handler()).rejects.toThrow(/Unauthorized/);
  });

  it('INNGEST_CRONS_DISABLED short-circuits without calling the route', async () => {
    process.env.INNGEST_CRONS_DISABLED = '1';

    const result = await fnById('cron-routines').handler();

    expect(result).toEqual({ skipped: 'disabled' });
    expect(routinesGetMock).not.toHaveBeenCalled();
  });
});
