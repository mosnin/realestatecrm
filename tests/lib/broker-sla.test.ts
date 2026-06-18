/**
 * Coverage for the speed-to-lead SLA sweep (lib/broker-sla.ts), focused on the
 * durable follow-up fix: a breach must open exactly one durable AgentTask so the
 * lead re-surfaces, and a second cron tick over an already-open follow-up must
 * NOT cut a duplicate.
 *
 * Mock shape mirrors tests/lib/brokerage-routing.test.ts:
 *   - A table-keyed chain mock on `@/lib/supabase`; every chain method returns
 *     the same chain and terminal awaits resolve through `termThen`.
 *   - Per-table overrides via `mockByTable[table] = { rows, ... }`.
 *   - `insertCalls[table]` records every insert payload so we can assert the
 *     AgentTask follow-up was (or wasn't) created.
 *   - `getBrokerageMembers` is mocked directly (its own DB fan-out is tested
 *     elsewhere) so we control the member-space topology cleanly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase table-keyed chain mock ───────────────────────────────────────
interface TableMock {
  rows?: Array<Record<string, unknown>>;
  error?: { message: string; code?: string } | null;
}
let mockByTable: Record<string, TableMock> = {};

const insertCalls: Record<string, Array<Record<string, unknown>>> = {};
const updateCalls: Record<string, Array<Record<string, unknown>>> = {};

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const override = mockByTable[table] ?? {};
    const rows = override.rows ?? [];
    const error = override.error ?? null;

    const termThen = Promise.resolve({ data: rows, error });

    const chain: Record<string, unknown> = {};
    const pass = (): Record<string, unknown> => chain;
    chain.select = vi.fn(pass);
    chain.eq = vi.fn(pass);
    chain.neq = vi.fn(pass);
    chain.in = vi.fn(pass);
    chain.is = vi.fn(pass);
    chain.contains = vi.fn(pass);
    chain.not = vi.fn(pass);
    chain.gt = vi.fn(pass);
    chain.lt = vi.fn(pass);
    chain.gte = vi.fn(pass);
    chain.lte = vi.fn(pass);
    chain.order = vi.fn(pass);
    chain.limit = vi.fn(pass);
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updateCalls[table] = updateCalls[table] ?? [];
      updateCalls[table].push(payload);
      return {
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
      };
    });
    chain.insert = vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      insertCalls[table] = insertCalls[table] ?? [];
      if (Array.isArray(payload)) insertCalls[table].push(...payload);
      else insertCalls[table].push(payload);
      return {
        ...chain,
        then: (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e),
      };
    });
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error }));
    chain.single = vi.fn(() => Promise.resolve({ data: rows[0] ?? null, error }));
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) => termThen.then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Collaborator mocks ──────────────────────────────────────────────────────
// Hoisted so the vi.mock factories (themselves hoisted to the top of the file)
// can close over them without a TDZ error.
const { getBrokerageMembersMock, notifyBrokerMock, sendPushToSpaceMock } = vi.hoisted(() => ({
  getBrokerageMembersMock: vi.fn(),
  notifyBrokerMock: vi.fn(async () => undefined),
  sendPushToSpaceMock: vi.fn(async () => 1),
}));

vi.mock('@/lib/brokerage-members', () => ({
  getBrokerageMembers: (...args: unknown[]) => getBrokerageMembersMock(...args),
}));

vi.mock('@/lib/broker-notify', () => ({ notifyBroker: notifyBrokerMock }));

vi.mock('@/lib/push', () => ({ sendPushToSpace: sendPushToSpaceMock }));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sweepBrokerageSla, type BrokerageSlaPolicy } from '@/lib/broker-sla';

// ── Fixtures ────────────────────────────────────────────────────────────────
const POLICY: BrokerageSlaPolicy = {
  id: 'brk_1',
  name: 'Acme Realty',
  slaFirstResponseMinutes: 60,
  slaEscalateMinutes: 120,
};

/** One realtor with a space, so the breach query has a space to scan. */
function seedOneMemberSpace(): void {
  getBrokerageMembersMock.mockResolvedValue([
    {
      id: 'mem_1',
      role: 'realtor_member',
      createdAt: '2026-01-01T00:00:00.000Z',
      userId: 'u_1',
      User: { id: 'u_1', name: 'Jane Agent', email: 'jane@x.com' },
      Space: { id: 's_1', slug: 'jane', name: 'Jane' },
    },
  ]);
}

/** A breached contact: assigned-by-broker, never contacted, created `minsAgo`. */
function breachedContact(minsAgo: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'c_1',
    name: 'Lead McLeadface',
    spaceId: 's_1',
    tags: ['assigned-by-broker'],
    createdAt: new Date(Date.now() - minsAgo * 60_000).toISOString(),
    lastContactedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockByTable = {};
  for (const k of Object.keys(insertCalls)) delete insertCalls[k];
  for (const k of Object.keys(updateCalls)) delete updateCalls[k];
  getBrokerageMembersMock.mockReset();
  notifyBrokerMock.mockClear();
  sendPushToSpaceMock.mockClear();
});

describe('sweepBrokerageSla — durable SLA follow-up', () => {
  it('(a) a nudge-level breach opens exactly one durable AgentTask follow-up', async () => {
    seedOneMemberSpace();
    // 90 min waited: past first-response (60) but under escalation (120) → nudge.
    mockByTable.Contact = { rows: [breachedContact(90)] };
    // No existing open SLA task → the dedup lookup returns empty.
    mockByTable.AgentTask = { rows: [] };

    const result = await sweepBrokerageSla(POLICY);

    expect(result.breached).toBe(1);
    expect(result.nudged).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.followUpsCreated).toBe(1);

    // Exactly one AgentTask inserted, carrying the dedup metadata + sla trigger.
    const inserts = insertCalls.AgentTask ?? [];
    expect(inserts).toHaveLength(1);
    const task = inserts[0];
    expect(task.spaceId).toBe('s_1');
    expect(task.triggerSource).toBe('sla');
    expect(task.status).toBe('queued');
    expect(task.metadata).toMatchObject({ kind: 'lead_sla_followup', contactId: 'c_1', level: 'nudge' });

    // Existing tag/push behavior is preserved.
    expect(sendPushToSpaceMock).toHaveBeenCalledTimes(1);
    const tagUpdate = (updateCalls.Contact ?? [])[0] as { tags?: string[] };
    expect(tagUpdate?.tags).toContain('sla-nudged');
  });

  it('(b) a second tick with an existing open SLA follow-up does NOT duplicate it', async () => {
    seedOneMemberSpace();
    // Same breach, but this time the lead already carries sla-nudged (one-shot
    // tag set on the first tick) AND an open SLA follow-up already exists.
    mockByTable.Contact = { rows: [breachedContact(90, { tags: ['assigned-by-broker', 'sla-nudged'] })] };
    mockByTable.AgentTask = { rows: [{ id: 'task_existing' }] };

    const result = await sweepBrokerageSla(POLICY);

    expect(result.breached).toBe(1);
    expect(result.followUpsCreated).toBe(0);

    // No new AgentTask row was inserted — the existing open follow-up dedups it.
    expect(insertCalls.AgentTask ?? []).toHaveLength(0);

    // And the one-shot push is not re-sent (sla-nudged already set).
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('escalation-level breach also opens a durable follow-up (level=escalation) and notifies the broker', async () => {
    seedOneMemberSpace();
    // 200 min waited: past escalation window (120).
    mockByTable.Contact = { rows: [breachedContact(200)] };
    mockByTable.AgentTask = { rows: [] };

    const result = await sweepBrokerageSla(POLICY);

    expect(result.escalated).toBe(1);
    expect(result.followUpsCreated).toBe(1);

    const inserts = insertCalls.AgentTask ?? [];
    expect(inserts).toHaveLength(1);
    expect((inserts[0].metadata as Record<string, unknown>).level).toBe('escalation');

    expect(notifyBrokerMock).toHaveBeenCalledTimes(1);
    expect((notifyBrokerMock.mock.calls as unknown[][])[0][0]).toMatchObject({ type: 'review_requested' });
  });
});
