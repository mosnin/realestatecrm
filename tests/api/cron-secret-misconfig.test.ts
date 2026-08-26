/**
 * Auth-misconfiguration tests for cron routes hardened in Fix 3.
 *
 * The bug: when CRON_SECRET is UNSET, these crons returned a silent 401, so a
 * misconfigured deploy looked like "an unauthorized caller" rather than "the
 * autonomous layer is dead". monitorCron treats a returned 5xx as a failed
 * check-in (Sentry alert), so the correct behavior on an unset secret is 500.
 * A present-but-wrong token stays a 401.
 *
 * Covers app/api/cron/cleanup and app/api/cron/sweep-paused-runs — the two
 * routes that still had the old silent-401 pattern.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Minimal supabase stub: rpc + chainable update/delete that resolve cleanly.
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['update', 'delete', 'eq', 'lt', 'select']) {
    chain[m] = vi.fn(() => chain);
  }
  // Awaiting the chain (update/delete with .select()) resolves to empty rows.
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(async () => ({ data: { deleted: 0 }, error: null })),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/billing/cost-budget-alarm', () => ({
  alarmDailyCostBudgets: vi.fn(async () => ({ scanned: 0, over: 0 })),
}));

import { GET as cleanupGET } from '@/app/api/cron/cleanup/route';
import { GET as sweepGET } from '@/app/api/cron/sweep-paused-runs/route';
import { logger } from '@/lib/logger';

type CronGet = (req: unknown) => Promise<Response>;

const SAVED = process.env.CRON_SECRET;

function req(authHeader?: string): unknown {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  return new Request('http://localhost/api/cron/x', { method: 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'right-secret';
});
afterEach(() => {
  if (SAVED === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = SAVED;
});

describe.each([
  ['cleanup', cleanupGET as unknown as CronGet],
  ['sweep-paused-runs', sweepGET as unknown as CronGet],
])('GET /api/cron/%s — CRON_SECRET handling', (_name, GET) => {
  it('returns 500 (not 401) when CRON_SECRET is unset, and logs an error', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('Bearer right-secret'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(vi.mocked(logger.error)).toHaveBeenCalled();
  });

  it('returns 401 for a present-but-wrong token', async () => {
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('proceeds (not 401/500-misconfig) with the correct token', async () => {
    const res = await GET(req('Bearer right-secret'));
    expect(res.status).not.toBe(401);
    // Not the misconfiguration 500 — the handler ran past auth.
    if (res.status === 500) {
      expect(await res.json()).not.toEqual({ error: 'Server misconfigured' });
    }
  });
});
