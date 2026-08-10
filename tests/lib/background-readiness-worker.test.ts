/**
 * The scheduler check on the background-readiness page.
 *
 * This is the check whose ABSENCE let a dead scheduler read as healthy for
 * ~60 days, so these tests pin the honesty contract hard:
 *   - a reachable worker whose trigger has stopped is DOWN, not ok
 *   - "can't verify" is degraded, never ok (no health from absence of evidence)
 *   - two schedulers enabled at once is DOWN (double-fire hazard)
 *   - Inngest keys missing no longer implies recurring jobs are dead
 */

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

const q = vi.hoisted(() => ({
  workerHealth: vi.fn(),
  readWorkerTick: vi.fn(),
}));
vi.mock('@/lib/queue', () => ({
  workerHealth: q.workerHealth,
  readWorkerTick: q.readWorkerTick,
}));

const redisState = vi.hoisted(() => ({ configured: true }));
vi.mock('@/lib/redis', () => ({
  redis: { get: vi.fn(async () => null) },
  isRedisConfigured: () => redisState.configured,
}));

// 23 recurring jobs, matching the real manifest length semantics.
vi.mock('@/lib/inngest/cron-functions', () => ({
  CRON_MANIFEST: Array.from({ length: 23 }, (_, i) => ({ id: `cron-${i}` })),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }),
    }),
  },
}));

import { getBackgroundReadiness } from '@/lib/diagnostics/background-readiness';

const ENV_KEYS = ['WORKER_URL', 'WORKER_SECRET', 'INNGEST_CRONS_ENABLED', 'CRON_SECRET',
  'INNGEST_EVENT_KEY', 'INNGEST_SIGNING_KEY'] as const;
const saved: Record<string, string | undefined> = {};

const check = async (key: string) => {
  const { checks } = await getBackgroundReadiness();
  return checks.find((c) => c.key === key)!;
};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.WORKER_URL = 'https://w.example.workers.dev';
  process.env.WORKER_SECRET = 's';
  process.env.CRON_SECRET = 'c';
  delete process.env.INNGEST_CRONS_ENABLED;
  redisState.configured = true;
  q.workerHealth.mockReset().mockResolvedValue({ ok: true, scheduledJobs: 23 });
  q.readWorkerTick.mockReset().mockResolvedValue(new Date().toISOString());
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('scheduler check', () => {
  it('healthy worker with a fresh tick is ok', async () => {
    const c = await check('worker');
    expect(c.status).toBe('ok');
    expect(c.detail).toMatch(/23 recurring jobs/);
  });

  it('unconfigured worker is DOWN and says background work is dead', async () => {
    delete process.env.WORKER_URL;
    const c = await check('worker');
    expect(c.status).toBe('missing');
    expect(c.detail).toMatch(/dead|no background worker/i);
  });

  it('unreachable worker is DOWN', async () => {
    q.workerHealth.mockResolvedValue(null);
    expect((await check('worker')).status).toBe('missing');
  });

  it('reachable worker whose trigger stopped firing is DOWN — the 60-day bug', async () => {
    q.readWorkerTick.mockResolvedValue(new Date(Date.now() - 3 * 60 * 60_000).toISOString());
    const c = await check('worker');
    expect(c.status).toBe('missing');
    expect(c.detail).toMatch(/stopped firing/);
  });

  it('worker that has never ticked is DOWN even though /health is fine', async () => {
    q.readWorkerTick.mockResolvedValue(null);
    const c = await check('worker');
    expect(c.status).toBe('missing');
    expect(c.detail).toMatch(/never recorded a master tick/);
  });

  it('job-count mismatch (stale worker deploy) is degraded', async () => {
    q.workerHealth.mockResolvedValue({ ok: true, scheduledJobs: 20 });
    const c = await check('worker');
    expect(c.status).toBe('degraded');
    expect(c.detail).toMatch(/older deploy/);
  });

  it('unverifiable tick history is degraded, never ok', async () => {
    redisState.configured = false;
    const c = await check('worker');
    expect(c.status).toBe('degraded');
    expect(c.detail).toMatch(/unknown|can't be verified/i);
  });

  it('a dead scheduler drags the whole page to down', async () => {
    q.workerHealth.mockResolvedValue(null);
    expect((await getBackgroundReadiness()).overall).toBe('down');
  });
});

describe('scheduler exclusivity', () => {
  it('both schedulers enabled is DOWN (double-fire)', async () => {
    process.env.INNGEST_CRONS_ENABLED = '1';
    const c = await check('scheduler-conflict');
    expect(c.status).toBe('missing');
    expect(c.detail).toMatch(/twice|two schedulers/i);
  });

  it('worker only is ok', async () => {
    expect((await check('scheduler-conflict')).status).toBe('ok');
  });
});

describe('Inngest check no longer claims to schedule crons', () => {
  it('missing keys is degraded and exonerates recurring jobs', async () => {
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    const c = await check('inngest');
    expect(c.status).toBe('degraded');
    expect(c.detail).toMatch(/Recurring jobs are unaffected/);
    // and it must not tell the owner to enable cron mirrors alongside the worker
    expect(c.fix).toMatch(/Do NOT set INNGEST_CRONS_ENABLED/);
  });
});
