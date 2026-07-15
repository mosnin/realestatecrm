/**
 * Behavioral tests for lib/reactivation.ts — computeReactivations & topReferrers.
 *
 * Supabase is mocked with a per-table FIFO queue of terminals plus a per-table
 * op log, mirroring tests/lib/briefing-clients-waiting.test.ts. Each terminal
 * is one resolved read; the op log lets us assert the tenant scoping (the
 * `.eq('spaceId')` that IS the security boundary) and the closed-won/dormancy
 * filters directly.
 *
 * computeReactivations issues, in order:
 *   1. Deal            (won deals closed ≥ dormantMonths ago, scoped)
 *   2. Contact         (re-scoped; brokerage-routed dropped)
 *   3. ContactActivity (recent touches in the quiet window)
 *
 * topReferrers issues two Contact reads (referred rows, then referrer names).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { op: string; args: unknown[] };
type Terminal = { data?: unknown; error?: unknown };

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
      Promise.resolve(queueFor(table).shift() ?? { data: [], error: null });
    const pass =
      (name: string) =>
      (...args: unknown[]) => {
        log.push({ op: name, args });
        return chain;
      };
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lte', 'gte', 'order', 'limit']) {
      chain[m] = pass(m);
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { computeReactivations, topReferrers } from '@/lib/reactivation';

const SPACE = 'space-1';
const NOW = new Date('2026-07-15T12:00:00.000Z');

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k];
  for (const k of Object.keys(opsByTable)) delete opsByTable[k];
});

// ── computeReactivations ─────────────────────────────────────────────────────

describe('computeReactivations', () => {
  it('surfaces dormant closed-won clients, ranked by deal value, scoped by space', async () => {
    queueFor('Deal').push({
      data: [
        { id: 'd1', contactId: 'c1', value: 850_000, closedAt: '2025-10-01T00:00:00.000Z' },
        { id: 'd2', contactId: 'c2', value: 500_000, closedAt: '2026-01-01T00:00:00.000Z' },
      ],
      error: null,
    });
    queueFor('Contact').push({
      data: [
        { id: 'c1', name: 'Dana Whitfield', lastContactedAt: null, brokerageId: null },
        // touched in Feb — before the ~Apr quiet cutoff, so still dormant.
        { id: 'c2', name: 'Sam Ortiz', lastContactedAt: '2026-02-01T00:00:00.000Z', brokerageId: null },
      ],
      error: null,
    });
    queueFor('ContactActivity').push({ data: [], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });

    expect(result.map((r) => r.id)).toEqual(['c1', 'c2']); // 850k ranked above 500k
    expect(result[0]).toMatchObject({
      id: 'c1',
      name: 'Dana Whitfield',
      dealValue: 850_000,
      daysSinceTouch: null,
    });
    expect(result[0].monthsSince).toBeGreaterThanOrEqual(9);
    expect(result[0].reason).toBe(`Closed ${result[0].monthsSince}mo ago · no follow-up logged`);
    // Sam has a stored last touch → the reason quotes the computed day count.
    expect(result[1].daysSinceTouch).toBeGreaterThan(90);

    // Tenant boundary + closed-won/dormancy filters on the deal scan.
    const dealOps = opsFor('Deal');
    expect(dealOps).toContainEqual({ op: 'eq', args: ['spaceId', SPACE] });
    expect(dealOps).toContainEqual({ op: 'eq', args: ['status', 'won'] });
    expect(dealOps).toContainEqual({ op: 'not', args: ['contactId', 'is', null] });
    expect(dealOps).toContainEqual({ op: 'not', args: ['closedAt', 'is', null] });
    expect(dealOps.some((o) => o.op === 'lte' && o.args[0] === 'closedAt')).toBe(true);

    // Contact read re-asserts the space and drops brokerage-routed rows.
    const contactOps = opsFor('Contact');
    expect(contactOps).toContainEqual({ op: 'eq', args: ['spaceId', SPACE] });
    expect(contactOps).toContainEqual({ op: 'is', args: ['brokerageId', null] });

    // ContactActivity touch scan is scoped and windowed.
    const actOps = opsFor('ContactActivity');
    expect(actOps).toContainEqual({ op: 'eq', args: ['spaceId', SPACE] });
    expect(actOps.some((o) => o.op === 'gte' && o.args[0] === 'createdAt')).toBe(true);
  });

  it('excludes a client with a recent logged ContactActivity touch', async () => {
    queueFor('Deal').push({
      data: [{ id: 'd1', contactId: 'c1', value: 700_000, closedAt: '2025-09-01T00:00:00.000Z' }],
      error: null,
    });
    queueFor('Contact').push({
      data: [{ id: 'c1', name: 'Dana', lastContactedAt: null, brokerageId: null }],
      error: null,
    });
    // c1 was touched inside the quiet window → not dormant.
    queueFor('ContactActivity').push({ data: [{ contactId: 'c1' }], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });
    expect(result).toEqual([]);
  });

  it('excludes a client contacted inside the quiet window (lastContactedAt)', async () => {
    queueFor('Deal').push({
      data: [{ id: 'd1', contactId: 'c1', value: 700_000, closedAt: '2025-09-01T00:00:00.000Z' }],
      error: null,
    });
    queueFor('Contact').push({
      data: [{ id: 'c1', name: 'Dana', lastContactedAt: '2026-07-01T00:00:00.000Z', brokerageId: null }],
      error: null,
    });
    queueFor('ContactActivity').push({ data: [], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });
    expect(result).toEqual([]);
  });

  it('is empty (and never loads contacts) when no won deal qualifies', async () => {
    queueFor('Deal').push({ data: [], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });
    expect(result).toEqual([]);
    // No contactIds → the Contact/activity reads are skipped entirely.
    expect(opsFor('Contact').length).toBe(0);
    expect(opsFor('ContactActivity').length).toBe(0);
  });

  it('drops a brokerage-routed contact absent from the scoped Contact read', async () => {
    queueFor('Deal').push({
      data: [{ id: 'd1', contactId: 'c1', value: 700_000, closedAt: '2025-09-01T00:00:00.000Z' }],
      error: null,
    });
    // The `.is('brokerageId', null)` filter means the routed contact never
    // comes back — the engine has nothing to surface.
    queueFor('Contact').push({ data: [], error: null });
    queueFor('ContactActivity').push({ data: [], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });
    expect(result).toEqual([]);
  });

  it('collapses a repeat client to a single row at their highest-value deal', async () => {
    queueFor('Deal').push({
      data: [
        { id: 'd1', contactId: 'c1', value: 400_000, closedAt: '2025-06-01T00:00:00.000Z' },
        { id: 'd2', contactId: 'c1', value: 950_000, closedAt: '2025-11-01T00:00:00.000Z' },
      ],
      error: null,
    });
    queueFor('Contact').push({
      data: [{ id: 'c1', name: 'Dana', lastContactedAt: null, brokerageId: null }],
      error: null,
    });
    queueFor('ContactActivity').push({ data: [], error: null });

    const result = await computeReactivations(SPACE, { now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'c1', dealValue: 950_000 });
  });
});

// ── topReferrers ─────────────────────────────────────────────────────────────

describe('topReferrers', () => {
  it('ranks contacts by how many others they referred, scoped by space', async () => {
    queueFor('Contact').push({
      data: [
        { referredByContactId: 'c1' },
        { referredByContactId: 'c1' },
        { referredByContactId: 'c2' },
      ],
      error: null,
    });
    queueFor('Contact').push({
      data: [
        { id: 'c1', name: 'Dana Whitfield' },
        { id: 'c2', name: 'Sam Ortiz' },
      ],
      error: null,
    });

    const result = await topReferrers(SPACE);
    expect(result).toEqual([
      { id: 'c1', name: 'Dana Whitfield', referralCount: 2 },
      { id: 'c2', name: 'Sam Ortiz', referralCount: 1 },
    ]);

    const ops = opsFor('Contact');
    expect(ops).toContainEqual({ op: 'eq', args: ['spaceId', SPACE] });
    expect(ops).toContainEqual({ op: 'not', args: ['referredByContactId', 'is', null] });
  });

  it('is empty (and never loads names) when no referrals are recorded', async () => {
    queueFor('Contact').push({ data: [], error: null });

    const result = await topReferrers(SPACE);
    expect(result).toEqual([]);
    // Only the first (referred-rows) read ran; the name read was skipped.
    expect(queueFor('Contact').length).toBe(0);
  });
});
