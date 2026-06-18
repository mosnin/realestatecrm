/**
 * Route-level test for `GET /api/cron/agent-run-reconcile` (Fix #5, reconcile).
 *
 * Reconcile resolves AgentRunLedger rows still 'dispatched'/'in_flight' past the
 * confirm threshold against the run artifacts the orchestrator writes:
 *   - an artifact exists for the space at/after dispatchedAt → mark 'confirmed'
 *   - none, and past the longer fail threshold              → mark 'failed' ('no_artifact')
 *   - none, but not yet past the fail threshold             → leave pending
 * It NEVER auto-re-dispatches (no Modal call here at all).
 *
 * Mock strategy mirrors tests/api/agent-sweep.test.ts: a chainable thenable
 * supabase whose terminals come off an ordered queue. The route's call order is
 * deterministic: first the ledger SELECT, then per row up to three artifact
 * reads (AgentTrajectory → AgentActivityLog → AgentDraft, short-circuiting on a
 * hit), then one ledger UPDATE per resolved row.
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
    const passthrough = ['select', 'eq', 'in', 'gte', 'lt', 'order', 'limit', 'update'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(terminal).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { GET } from '@/app/api/cron/agent-run-reconcile/route';

// ── Helpers ───────────────────────────────────────────────────────────────────
const ENV_KEYS = ['CRON_SECRET', 'CRON_RUN_RECONCILE_DISABLED'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/agent-run-reconcile', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_RUN_RECONCILE_DISABLED;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('GET /api/cron/agent-run-reconcile', () => {
  it('rejects a missing Authorization header → 401', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects the wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
  });

  it('missing CRON_SECRET → 500 server misconfigured', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
  });

  it('kill switch → 200 skipped, no DB read', async () => {
    process.env.CRON_RUN_RECONCILE_DISABLED = '1';
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: 'kill-switch on' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('no unconfirmed rows → 200 zeroed', async () => {
    supabaseQueue = [{ data: [], error: null }];
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 0, confirmed: 0, failed: 0, pending: 0 });
  });

  it('marks in_flight → confirmed when an AgentTrajectory artifact exists', async () => {
    supabaseQueue = [
      // 1) ledger rows
      { data: [{ runId: 'r1', spaceId: 'space_1', dispatchedAt: minsAgo(20) }], error: null },
      // 2) AgentTrajectory artifact read — a hit short-circuits the other reads
      { data: [{ id: 'traj_1' }], error: null },
      // 3) ledger UPDATE
      { data: null, error: null },
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 1, confirmed: 1, failed: 0, pending: 0 });

    // The update set status='confirmed' with a confirmedAt on the right row.
    const upd = supabaseCalls.find((c) => c.table === 'AgentRunLedger' && c.chain.some(([m]) => m === 'update'));
    expect(upd).toBeDefined();
    const updArgs = upd!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updArgs.status).toBe('confirmed');
    expect(typeof updArgs.confirmedAt).toBe('string');
    const eq = upd!.chain.find(([m]) => m === 'eq');
    expect(eq?.[1]).toEqual(['runId', 'r1']);
    // The first artifact hit short-circuits: only AgentTrajectory was queried.
    expect(supabaseCalls.map((c) => c.table)).toContain('AgentTrajectory');
    expect(supabaseCalls.map((c) => c.table)).not.toContain('AgentActivityLog');
  });

  it('confirms via AgentDraft when trajectory + activity are absent (checks all three sources)', async () => {
    supabaseQueue = [
      { data: [{ runId: 'r1', spaceId: 'space_1', dispatchedAt: minsAgo(20) }], error: null },
      { data: [], error: null }, // AgentTrajectory: none
      { data: [], error: null }, // AgentActivityLog: none
      { data: [{ id: 'draft_1' }], error: null }, // AgentDraft: hit
      { data: null, error: null }, // ledger UPDATE
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ confirmed: 1, failed: 0 });
    const tables = supabaseCalls.map((c) => c.table);
    expect(tables).toEqual(
      expect.arrayContaining(['AgentTrajectory', 'AgentActivityLog', 'AgentDraft']),
    );
  });

  it('marks failed (no_artifact) when nothing exists past the fail threshold', async () => {
    supabaseQueue = [
      // Dispatched 50 min ago (> 45 min fail threshold) with no artifacts.
      { data: [{ runId: 'r_old', spaceId: 'space_1', dispatchedAt: minsAgo(50) }], error: null },
      { data: [], error: null }, // AgentTrajectory: none
      { data: [], error: null }, // AgentActivityLog: none
      { data: [], error: null }, // AgentDraft: none
      { data: null, error: null }, // ledger UPDATE
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 1, confirmed: 0, failed: 1, pending: 0 });

    const upd = supabaseCalls.find((c) => c.table === 'AgentRunLedger' && c.chain.some(([m]) => m === 'update'));
    const updArgs = upd!.chain.find(([m]) => m === 'update')![1][0] as Record<string, unknown>;
    expect(updArgs.status).toBe('failed');
    expect(updArgs.failureReason).toBe('no_artifact');
  });

  it('leaves a still-young unconfirmed row pending (no artifact, before the fail threshold)', async () => {
    supabaseQueue = [
      // 20 min ago: past the 15-min confirm cutoff (so it was selected) but under
      // the 45-min fail threshold — not yet failable.
      { data: [{ runId: 'r_young', spaceId: 'space_1', dispatchedAt: minsAgo(20) }], error: null },
      { data: [], error: null }, // AgentTrajectory: none
      { data: [], error: null }, // AgentActivityLog: none
      { data: [], error: null }, // AgentDraft: none
      // No UPDATE expected.
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ scanned: 1, confirmed: 0, failed: 0, pending: 1 });
    // It must NOT have been written — no auto-redispatch, no premature fail.
    const upd = supabaseCalls.find((c) => c.table === 'AgentRunLedger' && c.chain.some(([m]) => m === 'update'));
    expect(upd).toBeUndefined();
  });

  it('the ledger SELECT filters to unconfirmed statuses', async () => {
    supabaseQueue = [{ data: [], error: null }];
    await invoke('Bearer test-secret');
    const sel = supabaseCalls.find((c) => c.table === 'AgentRunLedger');
    expect(sel).toBeDefined();
    const inCall = sel!.chain.find(([m]) => m === 'in');
    expect(inCall?.[1]).toEqual(['status', ['dispatched', 'in_flight']]);
  });
});
