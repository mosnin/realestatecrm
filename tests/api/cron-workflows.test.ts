/**
 * Route-level tests for `GET /api/cron/workflows` — the watermark catch-up
 * behavior. The tick loads enabled schedule workflows WITH their
 * lastScheduledFireAt watermark, fires every workflow whose most recent
 * scheduled slot is newer than its watermark (so a late/missed tick still
 * fires that slot exactly once), stamps the SLOT back as the new watermark,
 * and degrades gracefully to the old strict-hour rule when the watermark
 * column doesn't exist yet (code deployed before the migration).
 *
 * Mock strategy mirrors tests/api/cron-routines.test.ts: chainable thenable
 * supabase whose terminals come off a queue, and a mocked runWorkflow.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Supabase mock ───────────────────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit', 'update', 'order']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Executor mock ───────────────────────────────────────────────────────────
const { runWorkflowMock } = vi.hoisted(() => ({
  runWorkflowMock: vi.fn(async (_input: unknown) => undefined),
}));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflow: runWorkflowMock }));

import { GET } from '@/app/api/cron/workflows/route';

// ── Helpers ─────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/workflows', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

function wf(
  id: string,
  config: { cadence: string; hour?: number; timezone?: string },
  lastScheduledFireAt: string | null,
) {
  return {
    id,
    spaceId: `space-${id}`,
    trigger: { type: 'schedule', config },
    conditions: [],
    actions: [],
    autonomy: 'draft',
    lastScheduledFireAt,
  };
}

/** All Workflow.update() stamp calls, with their payload and eq filters. */
function stampCalls() {
  return supabaseCalls
    .filter((c) => c.table === 'Workflow' && c.chain.some(([m]) => m === 'update'))
    .map((c) => ({
      payload: c.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>,
      id: c.chain.find(([m, args]) => m === 'eq' && args[0] === 'id')?.[1][1],
    }));
}

const savedSecret = { CRON_SECRET: undefined as string | undefined, DISABLED: undefined as string | undefined };

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  runWorkflowMock.mockReset().mockResolvedValue(undefined);
  savedSecret.CRON_SECRET = process.env.CRON_SECRET;
  savedSecret.DISABLED = process.env.CRON_WORKFLOWS_DISABLED;
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_WORKFLOWS_DISABLED;
  // A LATE tick — 11:07 UTC on Monday 2026-06-29. The 09:00 slot was missed.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-29T11:07:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  if (savedSecret.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret.CRON_SECRET;
  if (savedSecret.DISABLED === undefined) delete process.env.CRON_WORKFLOWS_DISABLED;
  else process.env.CRON_WORKFLOWS_DISABLED = savedSecret.DISABLED;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/workflows', () => {
  it('rejects a missing/wrong bearer with 401 and runs nothing', async () => {
    expect((await invoke(undefined)).status).toBe(401);
    expect((await invoke('Bearer nope')).status).toBe(401);
    expect(runWorkflowMock).not.toHaveBeenCalled();
    expect(supabaseCalls).toHaveLength(0);
  });

  it('missing CRON_SECRET → 500 fail-closed', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
  });

  it('CRON_WORKFLOWS_DISABLED short-circuits', async () => {
    process.env.CRON_WORKFLOWS_DISABLED = '1';
    const res = await invoke('Bearer test-secret');
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('a LATE tick catches up a missed daily slot and stamps the SLOT as the watermark', async () => {
    // daily@09:00, last fired yesterday; the 09:00 tick was missed, now = 11:07.
    supabaseQueue = [
      { data: [wf('w1', { cadence: 'daily', hour: 9 }, '2026-06-28T09:00:00.000Z')], error: null },
      { data: null, error: null }, // the stamp update
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 1, due: 1, ran: 1, errored: 0 });

    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    const arg = runWorkflowMock.mock.calls[0][0] as { workflow: { id: string }; triggerEvent: { type: string } };
    expect(arg.workflow.id).toBe('w1');
    expect(arg.triggerEvent.type).toBe('schedule');

    // Watermark = the 09:00 slot, NOT the 11:07 tick time.
    const stamps = stampCalls();
    expect(stamps).toHaveLength(1);
    expect(stamps[0].id).toBe('w1');
    expect(stamps[0].payload).toEqual({ lastScheduledFireAt: '2026-06-29T09:00:00.000Z' });
  });

  it('does NOT double-fire a slot that is already stamped', async () => {
    supabaseQueue = [
      { data: [wf('w1', { cadence: 'daily', hour: 9 }, '2026-06-29T09:00:00.000Z')], error: null },
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 1, due: 0, ran: 0 });
    expect(runWorkflowMock).not.toHaveBeenCalled();
    expect(stampCalls()).toHaveLength(0);
  });

  it('NULL watermark uses the strict hour rule: not due off-hour, due on the hour', async () => {
    // Off-hour (now = 11:07, schedule hour 9, no watermark) → skipped.
    supabaseQueue = [
      { data: [wf('w1', { cadence: 'daily', hour: 9 }, null)], error: null },
    ];
    let body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ due: 0, ran: 0 });
    expect(runWorkflowMock).not.toHaveBeenCalled();

    // Same workflow ticked ON its hour → fires and bootstraps the watermark.
    vi.setSystemTime(new Date('2026-06-29T09:00:30.000Z'));
    supabaseQueue = [
      { data: [wf('w1', { cadence: 'daily', hour: 9 }, null)], error: null },
      { data: null, error: null },
    ];
    body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ due: 1, ran: 1 });
    expect(stampCalls()[0].payload).toEqual({ lastScheduledFireAt: '2026-06-29T09:00:00.000Z' });
  });

  it('degrades gracefully when the watermark column is missing (pre-migration deploy)', async () => {
    // First select (with lastScheduledFireAt) errors; the legacy select runs.
    // now = 11:07 → an hourly workflow is due under the strict rule.
    supabaseQueue = [
      { data: null, error: { message: 'column Workflow.lastScheduledFireAt does not exist' } },
      { data: [{ ...wf('w2', { cadence: 'hourly' }, null), lastScheduledFireAt: undefined }], error: null },
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ scanned: 1, due: 1, ran: 1 });
    expect(runWorkflowMock).toHaveBeenCalledTimes(1);
    // No stamp attempted — the column doesn't exist.
    expect(stampCalls()).toHaveLength(0);
    // Both selects hit the Workflow table.
    expect(supabaseCalls.filter((c) => c.table === 'Workflow')).toHaveLength(2);
  });

  it('a throwing workflow run is counted errored but STILL stamps (no refire loop)', async () => {
    runWorkflowMock.mockRejectedValueOnce(new Error('executor blew up'));
    supabaseQueue = [
      { data: [wf('w1', { cadence: 'hourly' }, '2026-06-29T10:00:00.000Z')], error: null },
      { data: null, error: null },
    ];

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ due: 1, ran: 0, errored: 1 });
    expect(stampCalls()).toHaveLength(1);
    expect(stampCalls()[0].payload).toEqual({ lastScheduledFireAt: '2026-06-29T11:00:00.000Z' });
  });

  it('rows with a malformed trigger config are skipped, others still run', async () => {
    supabaseQueue = [
      {
        data: [
          { ...wf('bad', { cadence: 'hourly' }, null), trigger: { type: 'schedule' } },
          wf('good', { cadence: 'hourly' }, '2026-06-29T10:00:00.000Z'),
        ],
        error: null,
      },
      { data: null, error: null },
    ];

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ scanned: 2, due: 1, ran: 1 });
    const arg = runWorkflowMock.mock.calls[0][0] as { workflow: { id: string } };
    expect(arg.workflow.id).toBe('good');
  });
});
