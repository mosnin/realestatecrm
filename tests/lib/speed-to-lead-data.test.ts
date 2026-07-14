/**
 * Behavioral tests for lib/analytics/speed-to-lead-data.ts — the
 * tenant-scoped fetch behind the speed-to-lead cards. Executes
 * fetchSpeedToLead against a filter-recording supabase mock and asserts on
 * the query shapes (the .in('spaceId', …) IS the security boundary — the
 * service-role key bypasses RLS) and on the computed result.
 *
 * Contract under test:
 *   - EVERY query (Contact, InboxMessage, AgentDraft) is scoped to the
 *     given spaceIds and bounded (window filters + .limit()).
 *   - Leads exclude bulk imports but keep null-source contacts.
 *   - Touch events exclude inbound messages and internal notes.
 *   - Chippi attribution flows through both markers: AgentDraft.reasoning
 *     and InboxMessage.agentDraftId → first-touch draft.
 *   - Empty spaceIds / no leads short-circuit without event queries.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// speed-to-lead-data imports the first-touch marker from lib/leads/first-touch;
// stub that module's heavier collaborators so the import graph stays inert.
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock('@/lib/push', () => ({ sendPushToSpace: vi.fn(async () => 0) }));
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: vi.fn(async () => null) }));

// ── Supabase mock: per-table result queue + full filter-call capture ────────
type Terminal = { data?: unknown; error?: unknown };
interface RecordedQuery {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

const queues: Record<string, Terminal[]> = {};
const recorded: RecordedQuery[] = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const record: RecordedQuery = { table, calls: [] };
    recorded.push(record);
    const chain: Record<string, unknown> = {};
    const track =
      (method: string) =>
      (...args: unknown[]) => {
        record.calls.push({ method, args });
        return chain;
      };
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'or', 'order', 'limit']) {
      chain[m] = vi.fn(track(m));
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) => {
      const t = queueFor(table).shift() ?? { data: [], error: null };
      return Promise.resolve(t).then(resolve, reject);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { fetchSpeedToLead, getSpaceSpeedToLead } from '@/lib/analytics/speed-to-lead-data';
import { FIRST_TOUCH_REASONING } from '@/lib/leads/first-touch';

const WINDOW = {
  from: new Date('2026-06-14T00:00:00Z'),
  to: new Date('2026-07-14T00:00:00Z'),
};
const T = (min: number) =>
  new Date(WINDOW.from.getTime() + min * 60_000).toISOString();

function callsOf(q: RecordedQuery, method: string): unknown[][] {
  return q.calls.filter((c) => c.method === method).map((c) => c.args);
}

beforeEach(() => {
  for (const k of Object.keys(queues)) delete queues[k];
  recorded.length = 0;
});

describe('fetchSpeedToLead', () => {
  it('returns the empty result without querying when there are no spaces', async () => {
    const r = await fetchSpeedToLead([], WINDOW);
    expect(r.leadCount).toBe(0);
    expect(r.medianMinutes).toBeNull();
    expect(recorded).toHaveLength(0);
  });

  it('short-circuits after the Contact query when the window has no leads', async () => {
    queueFor('Contact').push({ data: [], error: null });
    const r = await fetchSpeedToLead(['space-1'], WINDOW);
    expect(r.leadCount).toBe(0);
    expect(recorded.map((q) => q.table)).toEqual(['Contact']);
  });

  it('scopes every query to the tenant spaceIds and bounds it', async () => {
    queueFor('Contact').push({
      data: [
        { id: 'c1', createdAt: T(0) },
        { id: 'c2', createdAt: T(10) },
      ],
      error: null,
    });
    queueFor('InboxMessage').push({ data: [], error: null });
    queueFor('AgentDraft').push({ data: [], error: null });

    await fetchSpeedToLead(['space-1', 'space-2'], WINDOW);

    const byTable = Object.fromEntries(recorded.map((q) => [q.table, q]));
    expect(Object.keys(byTable).sort()).toEqual(['AgentDraft', 'Contact', 'InboxMessage']);

    for (const table of ['Contact', 'InboxMessage', 'AgentDraft']) {
      const q = byTable[table];
      // Tenant boundary: .in('spaceId', [...]) present on EVERY query.
      expect(callsOf(q, 'in')).toContainEqual(['spaceId', ['space-1', 'space-2']]);
      // Bounded: a limit and a lower time bound on every query.
      expect(callsOf(q, 'limit').length).toBeGreaterThan(0);
      expect(
        callsOf(q, 'gte').some(([col, val]) => typeof col === 'string' && val === WINDOW.from.toISOString()),
      ).toBe(true);
    }

    // Leads: created strictly inside the window, imports excluded,
    // null-source contacts kept.
    const contactQ = byTable['Contact'];
    expect(callsOf(contactQ, 'gte')).toContainEqual(['createdAt', WINDOW.from.toISOString()]);
    expect(callsOf(contactQ, 'lt')).toContainEqual(['createdAt', WINDOW.to.toISOString()]);
    expect(callsOf(contactQ, 'or')).toContainEqual(['source.is.null,source.neq.import']);

    // Touches: outbound only, internal notes excluded, restricted to the
    // window's contact ids.
    const msgQ = byTable['InboxMessage'];
    expect(callsOf(msgQ, 'eq')).toContainEqual(['direction', 'outbound']);
    expect(callsOf(msgQ, 'in')).toContainEqual(['channel', ['email', 'sms', 'portal']]);
    expect(callsOf(msgQ, 'in')).toContainEqual(['contactId', ['c1', 'c2']]);

    // Draft sends: sent status only, restricted to the same contacts.
    const draftQ = byTable['AgentDraft'];
    expect(callsOf(draftQ, 'eq')).toContainEqual(['status', 'sent']);
    expect(callsOf(draftQ, 'in')).toContainEqual(['contactId', ['c1', 'c2']]);
  });

  it('computes the distribution and attributes Chippi through both send records', async () => {
    queueFor('Contact').push({
      data: [
        { id: 'c1', createdAt: T(0) }, // touched by first-touch MESSAGE at +5m
        { id: 'c2', createdAt: T(0) }, // touched by first-touch DRAFT at +15m
        { id: 'c3', createdAt: T(0) }, // touched by realtor email at +55m
        { id: 'c4', createdAt: T(0) }, // never touched
      ],
      error: null,
    });
    queueFor('InboxMessage').push({
      data: [
        { contactId: 'c1', createdAt: T(5), agentDraftId: 'ft-draft-1' },
        { contactId: 'c3', createdAt: T(55), agentDraftId: null },
      ],
      error: null,
    });
    queueFor('AgentDraft').push({
      data: [
        // The draft behind c1's message — identifies it as a first touch.
        { id: 'ft-draft-1', contactId: 'c1', updatedAt: T(6), reasoning: FIRST_TOUCH_REASONING },
        // c2's first touch exists only as a sent draft.
        { id: 'ft-draft-2', contactId: 'c2', updatedAt: T(15), reasoning: FIRST_TOUCH_REASONING },
        // An unrelated sent sweep draft — later than c3's own email.
        { id: 'sweep-1', contactId: 'c3', updatedAt: T(90), reasoning: 'Follow up after tour' },
      ],
      error: null,
    });

    const r = await getSpaceSpeedToLead('space-1', WINDOW);

    expect(r.leadCount).toBe(4);
    expect(r.touchedCount).toBe(3);
    // Durations: 5, 15, 55 → median 15.
    expect(r.medianMinutes).toBe(15);
    expect(r.p90Minutes).toBeCloseTo(47, 5); // 15 + 0.8 * (55 - 15)
    // c1 (via message→draft link) and c2 (via draft reasoning); c3's first
    // touch was the realtor's own email, so the sweep draft doesn't count.
    expect(r.chippiFirstCount).toBe(2);
  });

  it('propagates a hard DB error so callers can degrade to a hidden card', async () => {
    queueFor('Contact').push({ data: null, error: new Error('boom') });
    await expect(fetchSpeedToLead(['space-1'], WINDOW)).rejects.toThrow('boom');
  });
});
