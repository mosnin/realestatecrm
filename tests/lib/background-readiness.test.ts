/**
 * Tests for lib/diagnostics/background-readiness.ts.
 *
 * Drives getBackgroundReadiness across env permutations by mutating
 * process.env (saved in beforeEach, restored in afterEach). Asserts:
 *   - all prerequisites set → overall 'ok'
 *   - Modal unset but Inngest/Composio/cron set → 'degraded' (the executor
 *     check is 'degraded', NOT 'missing' — the in-process fallback works)
 *   - Inngest/Composio/cron missing → 'down'
 *   - no secret VALUES leak into the report (only presence is reported)
 *
 * Supabase is mocked so the per-space "recent activity" check resolves without
 * a real DB. The recent-activity query is fixed to return no rows so the
 * permutation assertions key off the env checks alone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Supabase mock ───────────────────────────────────────────────────────────
// A thenable query builder that resolves to "no routines" so checkRecentActivity
// reports the benign 'ok' ("nothing scheduled") state.
const { supabaseMock } = vi.hoisted(() => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return {
    supabaseMock: { from: vi.fn(() => builder) },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import { getBackgroundReadiness } from '@/lib/diagnostics/background-readiness';

// Every env key the module probes.
const KEYS = [
  'MODAL_WEBHOOK_URL',
  'AGENT_INTERNAL_SECRET',
  'MODAL_CHAT_URL',
  'CRON_SECRET',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'COMPOSIO_API_KEY',
] as const;

// Sentinel secret values — used to prove no VALUE leaks into the report.
const SECRETS: Record<(typeof KEYS)[number], string> = {
  MODAL_WEBHOOK_URL: 'https://modal.example/webhook-SECRET',
  AGENT_INTERNAL_SECRET: 'agent-internal-SECRET',
  MODAL_CHAT_URL: 'https://modal.example/chat-SECRET',
  CRON_SECRET: 'cron-SECRET',
  INNGEST_EVENT_KEY: 'inngest-event-SECRET',
  INNGEST_SIGNING_KEY: 'inngest-signing-SECRET',
  COMPOSIO_API_KEY: 'composio-SECRET',
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  // Save then clear every key so each test starts from a known-empty slate.
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  // Restore exactly what was there before.
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setAll() {
  for (const k of KEYS) process.env[k] = SECRETS[k];
}

function checkByKey(checks: Awaited<ReturnType<typeof getBackgroundReadiness>>['checks'], key: string) {
  const c = checks.find((x) => x.key === key);
  expect(c, `expected a check with key "${key}"`).toBeTruthy();
  return c!;
}

describe('getBackgroundReadiness', () => {
  it("all prerequisites set → overall 'ok' and every env check is 'ok'", async () => {
    setAll();
    const report = await getBackgroundReadiness('space_1');

    expect(report.overall).toBe('ok');
    expect(checkByKey(report.checks, 'executor').status).toBe('ok');
    expect(checkByKey(report.checks, 'chat-offload').status).toBe('ok');
    expect(checkByKey(report.checks, 'cron').status).toBe('ok');
    expect(checkByKey(report.checks, 'inngest').status).toBe('ok');
    expect(checkByKey(report.checks, 'composio').status).toBe('ok');
  });

  it("Modal unset but Inngest/Composio/cron set → 'degraded' with executor 'degraded' (NOT 'missing')", async () => {
    process.env.CRON_SECRET = SECRETS.CRON_SECRET;
    process.env.INNGEST_EVENT_KEY = SECRETS.INNGEST_EVENT_KEY;
    process.env.INNGEST_SIGNING_KEY = SECRETS.INNGEST_SIGNING_KEY;
    process.env.COMPOSIO_API_KEY = SECRETS.COMPOSIO_API_KEY;
    // MODAL_WEBHOOK_URL / AGENT_INTERNAL_SECRET / MODAL_CHAT_URL deliberately unset.

    const report = await getBackgroundReadiness('space_1');

    expect(report.overall).toBe('degraded');

    const executor = checkByKey(report.checks, 'executor');
    expect(executor.status).toBe('degraded');
    // The whole point: the fallback works, so the executor is NEVER 'missing'.
    expect(executor.status).not.toBe('missing');

    // The hard-gap checks are all satisfied → none 'missing'.
    expect(checkByKey(report.checks, 'cron').status).toBe('ok');
    expect(checkByKey(report.checks, 'inngest').status).toBe('ok');
    expect(checkByKey(report.checks, 'composio').status).toBe('ok');
    expect(report.checks.some((c) => c.status === 'missing')).toBe(false);
  });

  it("missing Inngest/Composio/cron → overall 'down' and those checks are 'missing'", async () => {
    // Only Modal set — the no-fallback prerequisites are absent.
    process.env.MODAL_WEBHOOK_URL = SECRETS.MODAL_WEBHOOK_URL;
    process.env.AGENT_INTERNAL_SECRET = SECRETS.AGENT_INTERNAL_SECRET;

    const report = await getBackgroundReadiness('space_1');

    expect(report.overall).toBe('down');
    expect(checkByKey(report.checks, 'cron').status).toBe('missing');
    expect(checkByKey(report.checks, 'inngest').status).toBe('missing');
    expect(checkByKey(report.checks, 'composio').status).toBe('missing');
    // Executor IS configured here → 'ok'.
    expect(checkByKey(report.checks, 'executor').status).toBe('ok');
  });

  it("partial Inngest (only one key) → that check is 'missing'", async () => {
    process.env.INNGEST_EVENT_KEY = SECRETS.INNGEST_EVENT_KEY;
    // INNGEST_SIGNING_KEY intentionally absent.
    const report = await getBackgroundReadiness();
    expect(checkByKey(report.checks, 'inngest').status).toBe('missing');
  });

  it('omitting spaceId excludes the per-space recent-activity check', async () => {
    setAll();
    const report = await getBackgroundReadiness();
    expect(report.checks.some((c) => c.key === 'recent-activity')).toBe(false);
  });

  it('passing spaceId includes the recent-activity check', async () => {
    setAll();
    const report = await getBackgroundReadiness('space_1');
    expect(report.checks.some((c) => c.key === 'recent-activity')).toBe(true);
  });

  it('never leaks secret VALUES into the report — only presence is reported', async () => {
    setAll();
    const report = await getBackgroundReadiness('space_1');
    const serialized = JSON.stringify(report);
    for (const k of KEYS) {
      expect(serialized).not.toContain(SECRETS[k]);
    }
  });
});
