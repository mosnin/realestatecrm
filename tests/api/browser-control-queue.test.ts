/**
 * Behavioral tests for lib/browser-control/session.ts — the agent-facing
 * enqueue/await contract plus the extension-facing FIFO dispatch + result
 * recording. Drives the real functions against an in-memory fake Supabase
 * client; `navigate` targets go through the REAL SSRF guard
 * (assertPublicHttpUrl) using literal IPs so no DNS/network is needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-memory fake Supabase (per-table array store, PostgREST-ish chain) ───

type Row = Record<string, unknown>;

function makeFakeSupabase() {
  const tables: Record<string, Row[]> = {};
  const table = (name: string) => (tables[name] ??= []);

  function from(name: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' | null = null;
    let insertRows: Row[] = [];
    let updateValues: Row = {};
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    const filters: Array<(r: Row) => boolean> = [];

    const api: Record<string, unknown> = {
      select: () => { op = op ?? 'select'; return api; },
      insert: (values: Row | Row[]) => { op = 'insert'; insertRows = Array.isArray(values) ? values : [values]; return api; },
      update: (values: Row) => { op = 'update'; updateValues = values; return api; },
      delete: () => { op = 'delete'; return api; },
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; },
      is: (col: string, val: unknown) => { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return api; },
      lt: (col: string, val: unknown) => { filters.push((r) => (r[col] as string) < (val as string)); return api; },
      order: (col: string, opts?: { ascending?: boolean }) => { orderBy = { col, asc: opts?.ascending !== false }; return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: () => exec(true),
      single: () => exec(true),
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => exec(false).then(onF, onR),
    };

    async function exec(single: boolean) {
      if (op === 'insert') {
        for (const row of insertRows) table(name).push({ ...row });
        return { data: single ? insertRows[0] : insertRows, error: null };
      }
      let matched = table(name).filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, updateValues));
        return { data: single ? matched[0] ?? null : matched, error: null };
      }
      if (op === 'delete') {
        tables[name] = table(name).filter((r) => !filters.every((f) => f(r)));
        return { data: null, error: null };
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        matched = [...matched].sort((a, b) => {
          const av = a[col] as string, bv = b[col] as string;
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
      }
      if (limitN != null) matched = matched.slice(0, limitN);
      return { data: single ? matched[0] ?? null : matched, error: null };
    }

    return api;
  }

  return { from, __tables: tables };
}

const fake = makeFakeSupabase();
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, p) => (fake as unknown as Record<string, unknown>)[p as string] }) }));

import {
  enqueueAction,
  awaitActionResult,
  getActiveSession,
  dispatchNextAction,
  recordActionResult,
  expireStaleQueuedActions,
} from '@/lib/browser-control/session';
import type { BrowserActionResult } from '@/lib/browser-control/protocol';

function seedActiveSession(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: 'sess_1',
    spaceId: 'space_1',
    userId: 'user_1',
    linkId: 'link_1',
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    ...overrides,
  };
  fake.__tables.BrowserSession ??= [];
  fake.__tables.BrowserSession.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(fake.__tables)) fake.__tables[key].length = 0;
});

describe('enqueueAction', () => {
  it('returns no_session when the realtor has no connected extension', async () => {
    const result = await enqueueAction({ spaceId: 'space_1', userId: 'user_1', input: { type: 'screenshot' } });
    expect(result).toEqual({ error: 'no_session' });
    expect(fake.__tables.BrowserAction ?? []).toHaveLength(0);
  });

  it('queues a non-navigate action against the active session', async () => {
    seedActiveSession();
    const result = await enqueueAction({
      spaceId: 'space_1',
      userId: 'user_1',
      input: { type: 'click', selector: '#submit' },
    });
    expect('actionId' in result).toBe(true);
    const row = fake.__tables.BrowserAction[0];
    expect(row.status).toBe('queued');
    expect(row.sessionId).toBe('sess_1');
    expect(row.spaceId).toBe('space_1');
    expect((row.params as Row).selector).toBe('#submit');
  });

  it('allows navigate to a public address', async () => {
    seedActiveSession();
    // Literal public IP — skips DNS, no network needed in the test.
    const result = await enqueueAction({
      spaceId: 'space_1',
      userId: 'user_1',
      input: { type: 'navigate', url: 'https://1.1.1.1/listing' },
    });
    expect('actionId' in result).toBe(true);
    expect(fake.__tables.BrowserAction).toHaveLength(1);
  });

  it('rejects navigate to a private/loopback address (SSRF guard)', async () => {
    seedActiveSession();
    const result = await enqueueAction({
      spaceId: 'space_1',
      userId: 'user_1',
      input: { type: 'navigate', url: 'http://127.0.0.1:8080/admin' },
    });
    expect(result).toEqual({ error: 'blocked_url' });
    expect(fake.__tables.BrowserAction ?? []).toHaveLength(0);
  });

  it('rejects navigate to cloud metadata address', async () => {
    seedActiveSession();
    const result = await enqueueAction({
      spaceId: 'space_1',
      userId: 'user_1',
      input: { type: 'navigate', url: 'http://169.254.169.254/latest/meta-data/' },
    });
    expect(result).toEqual({ error: 'blocked_url' });
  });
});

describe('cross-tenant isolation — the .eq(spaceId) IS the boundary', () => {
  it('getActiveSession never returns another space\'s session', async () => {
    seedActiveSession({ spaceId: 'space_victim' });
    const mine = await getActiveSession('space_attacker', 'user_1');
    expect(mine).toBeNull();
  });

  it('awaitActionResult scoped to the wrong spaceId returns null even though the row exists', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_victim', sessionId: 'sess_1', status: 'done',
      result: { ok: true, summary: 'done' }, createdAt: new Date().toISOString(),
    }];
    const result = await awaitActionResult('act_1', { spaceId: 'space_attacker', timeoutMs: 50, pollIntervalMs: 10 });
    expect(result).toBeNull();
  });

  it('recordActionResult ignores an action belonging to a DIFFERENT link\'s session', async () => {
    seedActiveSession({ id: 'sess_victim', linkId: 'link_victim' });
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_victim', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    const spoofedResult: BrowserActionResult = { ok: true, summary: 'attacker-controlled' };
    // link_attacker never dispatched this action — its session is different.
    await recordActionResult('act_1', { spaceId: 'space_1', linkId: 'link_attacker' }, spoofedResult);
    expect(fake.__tables.BrowserAction[0].status).toBe('running');
    expect(fake.__tables.BrowserAction[0].result).toBeNull();
  });
});

describe('awaitActionResult', () => {
  it('returns the result immediately once the row is done', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', status: 'done',
      result: { ok: true, summary: 'Clicked Search' }, createdAt: new Date().toISOString(),
    }];
    const result = await awaitActionResult('act_1', { spaceId: 'space_1' });
    expect(result).toEqual({ ok: true, summary: 'Clicked Search' });
  });

  it('returns a synthesized error result for an expired action', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', status: 'expired',
      result: null, createdAt: new Date().toISOString(),
    }];
    const result = await awaitActionResult('act_1', { spaceId: 'space_1' });
    expect(result?.ok).toBe(false);
  });

  it('returns null on timeout while the action is still queued (never fabricates success)', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', status: 'queued',
      result: null, createdAt: new Date().toISOString(),
    }];
    const result = await awaitActionResult('act_1', { spaceId: 'space_1', timeoutMs: 40, pollIntervalMs: 10 });
    expect(result).toBeNull();
  });

  it('returns null for a nonexistent action', async () => {
    const result = await awaitActionResult('does_not_exist', { spaceId: 'space_1', timeoutMs: 20, pollIntervalMs: 10 });
    expect(result).toBeNull();
  });
});

describe('dispatchNextAction — FIFO', () => {
  it('dispatches queued actions in creation order and marks them running', async () => {
    fake.__tables.BrowserAction = [
      { id: 'act_3', spaceId: 'space_1', sessionId: 'sess_1', type: 'wait', params: { type: 'wait', ms: 0 }, status: 'queued', createdAt: '2026-01-01T00:00:03.000Z' },
      { id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', type: 'wait', params: { type: 'wait', ms: 0 }, status: 'queued', createdAt: '2026-01-01T00:00:01.000Z' },
      { id: 'act_2', spaceId: 'space_1', sessionId: 'sess_1', type: 'wait', params: { type: 'wait', ms: 0 }, status: 'queued', createdAt: '2026-01-01T00:00:02.000Z' },
    ];

    const first = await dispatchNextAction('sess_1', { spaceId: 'space_1' });
    expect(first?.id).toBe('act_1');
    expect(fake.__tables.BrowserAction.find((r) => r.id === 'act_1')?.status).toBe('running');

    const second = await dispatchNextAction('sess_1', { spaceId: 'space_1' });
    expect(second?.id).toBe('act_2');

    const third = await dispatchNextAction('sess_1', { spaceId: 'space_1' });
    expect(third?.id).toBe('act_3');

    const fourth = await dispatchNextAction('sess_1', { spaceId: 'space_1' });
    expect(fourth).toBeNull();
  });

  it('never dispatches another session\'s queued action', async () => {
    fake.__tables.BrowserAction = [
      { id: 'act_other', spaceId: 'space_1', sessionId: 'sess_other', type: 'wait', params: {}, status: 'queued', createdAt: new Date().toISOString() },
    ];
    const next = await dispatchNextAction('sess_1', { spaceId: 'space_1' });
    expect(next).toBeNull();
  });
});

describe('recordActionResult', () => {
  it('marks the action done with the extension-reported result', async () => {
    seedActiveSession();
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    await recordActionResult('act_1', { spaceId: 'space_1', linkId: 'link_1' }, { ok: true, summary: 'Clicked' });
    expect(fake.__tables.BrowserAction[0].status).toBe('done');
    expect(fake.__tables.BrowserAction[0].result).toEqual({ ok: true, summary: 'Clicked' });
  });

  it('marks the action error when the extension reports failure', async () => {
    seedActiveSession();
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_1', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    await recordActionResult('act_1', { spaceId: 'space_1', linkId: 'link_1' }, { ok: false, error: 'Selector not found' });
    expect(fake.__tables.BrowserAction[0].status).toBe('error');
  });
});

describe('expireStaleQueuedActions', () => {
  it('expires only queued actions older than the TTL, leaving fresh/running/done rows alone', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const fresh = new Date().toISOString();
    fake.__tables.BrowserAction = [
      { id: 'stale', spaceId: 'space_1', sessionId: 'sess_1', status: 'queued', createdAt: old },
      { id: 'still_fresh', spaceId: 'space_1', sessionId: 'sess_1', status: 'queued', createdAt: fresh },
      { id: 'already_running', spaceId: 'space_1', sessionId: 'sess_1', status: 'running', createdAt: old },
    ];
    await expireStaleQueuedActions('sess_1', { spaceId: 'space_1' });
    const byId = Object.fromEntries(fake.__tables.BrowserAction.map((r) => [r.id, r.status]));
    expect(byId.stale).toBe('expired');
    expect(byId.still_fresh).toBe('queued');
    expect(byId.already_running).toBe('running');
  });
});
