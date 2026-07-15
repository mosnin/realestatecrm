/**
 * Route test for GET /api/cron/review-nudge — the single-follow-up half of the
 * Post-Close Reputation Engine. Mirrors tests/api/cron-routines.test.ts.
 *
 * Locks in:
 *   - Auth fail-closed: unset CRON_SECRET → 500; missing/wrong Bearer → 401.
 *   - CRON_REVIEW_NUDGE_DISABLED short-circuits before any DB read.
 *   - The due query selects only sent, un-clicked, un-nudged, stale campaigns.
 *   - A due campaign in an active space drafts ONE pending nudge AND stamps
 *     nudgedAt (so a later tick's scan excludes it — never double-nudged).
 *   - A billing-blocked space's campaign is skipped (no draft) but still
 *     stamped nudgedAt so it can't jam the scan window.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
let queue: Terminal[] = [];
const calls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    const terminal = queue.shift() ?? { data: [], error: null };
    calls.push({ table, chain: chainCalls });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        chainCalls.push([m, args]);
        return chain;
      });
    }
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      chainCalls.push(['insert', [values]]);
      return chain;
    });
    chain.update = vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      chainCalls.push(['update', [values]]);
      return chain;
    });
    chain.single = vi.fn(() => Promise.resolve(terminal));
    chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// Compose stays neutral-fallback in tests (returns null) so no LLM is needed.
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: vi.fn(async () => null) }));
vi.mock('@/lib/notifications', () => ({ createAppNotification: vi.fn(async () => true) }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from '@/app/api/cron/review-nudge/route';

const ENV_KEYS = ['CRON_SECRET', 'CRON_REVIEW_NUDGE_DISABLED'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/review-nudge', { method: 'GET', headers });
  return GET(req as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  queue = [];
  calls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_REVIEW_NUDGE_DISABLED;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('GET /api/cron/review-nudge', () => {
  it('missing CRON_SECRET env → 500', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it('missing Authorization → 401, no DB read', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
  });

  it('CRON_REVIEW_NUDGE_DISABLED short-circuits → 200 disabled, no DB read', async () => {
    process.env.CRON_REVIEW_NUDGE_DISABLED = '1';
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('no due campaigns → 200 zeroed, only the ReviewCampaign scan ran', async () => {
    queue = [{ data: [], error: null }];
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 0, nudged: 0, skipped: 0 });
    expect(calls.map((c) => c.table)).toEqual(['ReviewCampaign']);
  });

  it('the scan filters on status=sent, un-clicked, un-nudged, and stale sentAt', async () => {
    queue = [{ data: [], error: null }];
    await invoke('Bearer test-secret');
    const scan = calls[0].chain;
    expect(scan).toContainEqual(['eq', ['status', 'sent']]);
    expect(scan).toContainEqual(['is', ['clickedAt', null]]);
    expect(scan).toContainEqual(['is', ['nudgedAt', null]]);
    const lte = scan.find(([m]) => m === 'lte');
    expect(lte?.[1]?.[0]).toBe('sentAt');
  });

  it('drafts ONE pending nudge for a due campaign in an active space and stamps nudgedAt', async () => {
    queue = [
      // due campaigns
      { data: [{ id: 'camp_1', spaceId: 's1', dealId: 'deal_1', contactId: 'c_1', channel: 'email' }], error: null },
      // spaces (active)
      { data: [{ id: 's1', slug: 'acme', stripeSubscriptionStatus: 'active', stripePeriodEnd: '2099-01-01T00:00:00.000Z' }], error: null },
      // Contact lookup (reachable via email)
      { data: { id: 'c_1', name: 'Jane Doe', email: 'jane@example.com', phone: null }, error: null },
      // AgentDraft insert → id
      { data: { id: 'draft_1' }, error: null },
      // ReviewCampaign nudgedAt stamp
      { data: null, error: null },
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 1, nudged: 1, skipped: 0 });

    const draft = inserts.find((i) => i.table === 'AgentDraft');
    expect(draft).toBeDefined();
    expect(draft!.values.status).toBe('pending');
    expect(String(draft!.values.content)).toContain('/api/reviews/camp_1');

    const stamp = updates.find((u) => u.table === 'ReviewCampaign');
    expect(stamp).toBeDefined();
    expect(typeof stamp!.values.nudgedAt).toBe('string');
  });

  it('skips a billing-blocked space but still stamps nudgedAt (no draft, no double-nudge)', async () => {
    queue = [
      { data: [{ id: 'camp_1', spaceId: 's1', dealId: 'deal_1', contactId: 'c_1', channel: 'email' }], error: null },
      // space is lapsed-paid → blocked
      { data: [{ id: 's1', slug: 'acme', stripeSubscriptionStatus: 'canceled', stripePeriodEnd: null }], error: null },
      // skip-stamp update
      { data: null, error: null },
    ];

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ due: 1, nudged: 0, skipped: 1 });

    expect(inserts.find((i) => i.table === 'AgentDraft')).toBeUndefined();
    const stamp = updates.find((u) => u.table === 'ReviewCampaign');
    expect(stamp).toBeDefined();
    expect(typeof stamp!.values.nudgedAt).toBe('string');
  });
});
