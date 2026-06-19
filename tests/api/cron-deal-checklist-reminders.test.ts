/**
 * Route-level test for GET /api/cron/deal-checklist-reminders.
 *
 * This cron sweeps overdue (dueAt < now, completedAt IS NULL) deal-checklist
 * items, groups them by space, and sends each space owner ONE push digest.
 * Tests cover:
 *   - Auth (Bearer CRON_SECRET; unset → 500, wrong → 401, missing → 401)
 *   - Redis day-lock idempotency (second invocation same day → skipped)
 *   - No overdue items → notifies nobody
 *   - Happy path: overdue items across two spaces → one push per space
 *   - notifyPush=false for a space → that space is skipped
 *   - A push failure in one space never aborts the batch
 *
 * sendPushToSpace / redis / supabase are mocked so the test exercises the
 * cron's ORCHESTRATION + idempotency — the logic that lives in the route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Redis lock: configurable per test (OK = claimed, null = already locked).
let lockResult: string | null = 'OK';
const redisSet = vi.fn(async (..._a: unknown[]) => lockResult);
vi.mock('@/lib/redis', () => ({ redis: { set: (...a: unknown[]) => redisSet(...a) } }));

// Push: configurable per call. Default sends to 1 subscription.
const sendPushToSpace = vi.fn(async (..._a: unknown[]) => 1);
vi.mock('@/lib/push', () => ({ sendPushToSpace: (...a: unknown[]) => sendPushToSpace(...a) }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Sentry wrapper passthrough so monitorCron doesn't phone home.
vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'check-in-id'),
  captureException: vi.fn(),
}));

// ── Supabase table-routed mock ───────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
// Per-table queue of terminals (consumed in call order). A query is resolved
// either by awaiting the chain directly (DealChecklistItem / Deal / .in) or via
// .maybeSingle() (Space / SpaceSetting).
let selectQueue: Record<string, Terminal[]> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.is = vi.fn(() => chain);

    const next = (): Terminal => (selectQueue[table] ?? []).shift() ?? { data: [], error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    // Awaiting the chain directly (no maybeSingle) pulls the next terminal too.
    chain.then = (resolve: (v: Terminal) => unknown) => Promise.resolve(next()).then(resolve);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { GET } from '@/app/api/cron/deal-checklist-reminders/route';

// ── Helpers ──────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/deal-checklist-reminders', {
    method: 'GET',
    headers,
  });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

const SAVED = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = {};
  lockResult = 'OK';
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  if (SAVED === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = SAVED;
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('GET /api/cron/deal-checklist-reminders — auth', () => {
  it('missing Authorization → 401', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(sendPushToSpace).not.toHaveBeenCalled();
  });

  it('wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
  });

  it('unset CRON_SECRET → 500 server misconfigured', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
  });
});

describe('GET /api/cron/deal-checklist-reminders — idempotency', () => {
  it('day-lock already held → 200 skipped, sends nothing', async () => {
    lockResult = null; // SETNX returns null when the key exists
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.skipped).toBe('already_ran_today');
    expect(sendPushToSpace).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/deal-checklist-reminders — sweep', () => {
  it('no overdue items → notifies nobody', async () => {
    selectQueue = { DealChecklistItem: [{ data: [], error: null }] };
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.notified).toBe(0);
    expect(body.spaces).toBe(0);
    expect(sendPushToSpace).not.toHaveBeenCalled();
  });

  it('overdue items across two spaces → one push per space', async () => {
    selectQueue = {
      DealChecklistItem: [
        {
          data: [
            { id: 'i1', label: 'Earnest money', dealId: 'd1', spaceId: 'space_1', dueAt: '2026-06-10T00:00:00.000Z' },
            { id: 'i2', label: 'Inspection', dealId: 'd1', spaceId: 'space_1', dueAt: '2026-06-15T00:00:00.000Z' },
            { id: 'i3', label: 'Appraisal', dealId: 'd2', spaceId: 'space_2', dueAt: '2026-06-12T00:00:00.000Z' },
          ],
          error: null,
        },
      ],
      Deal: [{ data: [{ id: 'd1', title: '123 Main' }, { id: 'd2', title: '9 Oak' }], error: null }],
      // Two spaces resolved in iteration order: space_1 then space_2. Each space
      // does Space.maybeSingle() then SpaceSetting.maybeSingle().
      Space: [
        { data: { name: 'Acme', slug: 'acme' }, error: null },
        { data: { name: 'Beta', slug: 'beta' }, error: null },
      ],
      SpaceSetting: [
        { data: { notifyPush: true }, error: null },
        { data: { notifyPush: true }, error: null },
      ],
    };

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.spaces).toBe(2);
    expect(body.notified).toBe(2);
    expect(sendPushToSpace).toHaveBeenCalledTimes(2);
    // The digest leads with the most-overdue item (earliest dueAt). For space_1
    // that's "Earnest money" (2026-06-10), and the count is 2.
    expect(sendPushToSpace).toHaveBeenCalledWith(
      'space_1',
      expect.objectContaining({
        title: '2 overdue checklist items',
        url: '/s/acme/deals',
      }),
    );
    const space1Call = sendPushToSpace.mock.calls.find((c) => c[0] === 'space_1');
    expect((space1Call![1] as { body: string }).body).toContain('Earnest money');
    expect((space1Call![1] as { body: string }).body).toContain('123 Main');
  });

  it('notifyPush=false for a space → that space is skipped', async () => {
    selectQueue = {
      DealChecklistItem: [
        {
          data: [
            { id: 'i1', label: 'Closing', dealId: 'd1', spaceId: 'space_1', dueAt: '2026-06-10T00:00:00.000Z' },
          ],
          error: null,
        },
      ],
      Deal: [{ data: [{ id: 'd1', title: '123 Main' }], error: null }],
      Space: [{ data: { name: 'Acme', slug: 'acme' }, error: null }],
      SpaceSetting: [{ data: { notifyPush: false }, error: null }],
    };

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.spaces).toBe(1);
    expect(body.notified).toBe(0);
    expect(sendPushToSpace).not.toHaveBeenCalled();
  });

  it('a push failure in one space never aborts the batch', async () => {
    selectQueue = {
      DealChecklistItem: [
        {
          data: [
            { id: 'i1', label: 'Closing', dealId: 'd1', spaceId: 'space_1', dueAt: '2026-06-10T00:00:00.000Z' },
            { id: 'i2', label: 'Appraisal', dealId: 'd2', spaceId: 'space_2', dueAt: '2026-06-11T00:00:00.000Z' },
          ],
          error: null,
        },
      ],
      Deal: [{ data: [{ id: 'd1', title: '123 Main' }, { id: 'd2', title: '9 Oak' }], error: null }],
      Space: [
        { data: { name: 'Acme', slug: 'acme' }, error: null },
        { data: { name: 'Beta', slug: 'beta' }, error: null },
      ],
      SpaceSetting: [
        { data: { notifyPush: true }, error: null },
        { data: { notifyPush: true }, error: null },
      ],
    };
    // First push throws, second succeeds.
    sendPushToSpace.mockRejectedValueOnce(new Error('push boom'));

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.spaces).toBe(2);
    // The failed space contributes 0; the surviving space contributes 1.
    expect(body.notified).toBe(1);
    expect(sendPushToSpace).toHaveBeenCalledTimes(2);
  });
});
