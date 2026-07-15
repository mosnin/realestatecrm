/**
 * Behavioral tests for countClientsWaiting (lib/briefing/dashboard.ts) — the
 * count behind the Brief's "N clients waiting on you" signal and the inbox
 * unread badge.
 *
 * Contract under test:
 *   - Counts InboxThread rows scoped to the space AND carrying unread inbound
 *     (unreadCount > 0). The .eq('spaceId') is the tenant boundary; the
 *     .gt('unreadCount', 0) is what "waiting" means.
 *   - A head/count read with no rows resolves to 0, never null/undefined.
 *
 * Supabase is mocked with a per-table chain that records the filter ops so the
 * scoping can be asserted, mirroring tests/lib/first-touch.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { op: string; args: unknown[] };
type Terminal = { count?: number | null; data?: unknown; error?: unknown };

const opsByTable: Record<string, Op[]> = {};
const queues: Record<string, Terminal[]> = {};

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}
function opsFor(table: string): Op[] {
  if (!opsByTable[table]) opsByTable[table] = [];
  return opsByTable[table];
}

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const log = opsFor(table);
    const chain: Record<string, unknown> = {};
    const next = (): Promise<Terminal> =>
      Promise.resolve(queueFor(table).shift() ?? { count: null, error: null });
    const pass =
      (name: string) =>
      (...args: unknown[]) => {
        log.push({ op: name, args });
        return chain;
      };
    chain.select = pass('select');
    chain.eq = pass('eq');
    chain.gt = pass('gt');
    chain.order = pass('order');
    chain.limit = pass('limit');
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { countClientsWaiting } from '@/lib/briefing/dashboard';

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k];
  for (const k of Object.keys(opsByTable)) delete opsByTable[k];
});

describe('countClientsWaiting', () => {
  it('returns the count of unread-bearing threads, scoped by space + unreadCount', async () => {
    queueFor('InboxThread').push({ count: 3, error: null });

    const n = await countClientsWaiting('space_1');

    expect(n).toBe(3);
    const ops = opsFor('InboxThread');
    // Tenant boundary: the read is scoped to the space.
    expect(ops).toContainEqual({ op: 'eq', args: ['spaceId', 'space_1'] });
    // "Waiting" means at least one unread inbound.
    expect(ops).toContainEqual({ op: 'gt', args: ['unreadCount', 0] });
  });

  it('resolves to 0 when the count comes back null (no threads)', async () => {
    queueFor('InboxThread').push({ count: null, error: null });
    await expect(countClientsWaiting('space_1')).resolves.toBe(0);
  });

  it('reads from the InboxThread table', async () => {
    queueFor('InboxThread').push({ count: 7, error: null });
    await countClientsWaiting('space_1');
    // If the read hit the wrong table, InboxThread would have no recorded ops.
    expect(opsFor('InboxThread').length).toBeGreaterThan(0);
  });
});
