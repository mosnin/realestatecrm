/**
 * Behavioral tests for the headless-routing surface Track B adds:
 *   - lib/browser-control/index.ts: resolveBrowserRuntime + needsLoggedInBrowser
 *   - lib/browser-control/session.ts: startHeadlessSession / endHeadlessSession /
 *     getHeadlessSessionById / recordHeadlessActionResult
 *
 * Drives the REAL functions against an in-memory fake Supabase client (same
 * per-table array-store / PostgREST-ish chain pattern as
 * tests/api/browser-control-queue.test.ts), so this exercises the actual
 * SQL-shaped queries (.eq chains), not a mocked call-count assertion.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── In-memory fake Supabase (per-table array store, PostgREST-ish chain) ───

type Row = Record<string, unknown>;

function makeFakeSupabase() {
  const tables: Record<string, Row[]> = {};
  const table = (name: string) => (tables[name] ??= []);

  async function rpc(name: string, args: Record<string, unknown>) {
    if (name === 'stop_headless_browser_session') {
      const session = table('BrowserSession').find((row) => row.id === args.p_session_id && row.spaceId === args.p_space_id && row.source === 'headless');
      if (!session) return { data: false, error: null };
      session.status = 'ended';
      return { data: true, error: null };
    }
    if (name !== 'start_headless_browser_session') {
      return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    }

    const existing = table('BrowserSession').find((row) => (
      row.spaceId === args.p_space_id
      && row.userId === args.p_user_id
      && row.source === 'headless'
      && row.status === 'active'
    ));
    if (existing) return { data: existing.id, error: null };

    table('BrowserSession').push({
      id: args.p_session_id,
      spaceId: args.p_space_id,
      userId: args.p_user_id,
      linkId: null,
      status: 'active',
      source: 'headless',
      startedAt: args.p_started_at,
      endedAt: null,
    });
    return { data: args.p_session_id, error: null };
  }

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
      in: (col: string, values: unknown[]) => { filters.push((r) => values.includes(r[col])); return api; },
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

  return { from, rpc, __tables: tables };
}

const fake = makeFakeSupabase();
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, p) => (fake as unknown as Record<string, unknown>)[p as string] }) }));

import {
  startHeadlessSession,
  endHeadlessSession,
  getHeadlessSessionById,
  recordHeadlessActionResult,
  getActiveSession,
  enqueueActionForSession,
} from '@/lib/browser-control/session';
import { resolveBrowserRuntime, needsLoggedInBrowser } from '@/lib/browser-control';

function seedSession(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: 'sess_1',
    spaceId: 'space_1',
    userId: 'user_1',
    linkId: 'link_1',
    status: 'active',
    source: 'extension',
    startedAt: new Date().toISOString(),
    endedAt: null,
    lastPolledAt: new Date().toISOString(),
    ...overrides,
  };
  fake.__tables.BrowserSession ??= [];
  fake.__tables.BrowserSession.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(fake.__tables)) fake.__tables[key].length = 0;
  process.env.CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'true';
  process.env.NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'true';
  process.env.CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS = 'space_1';
});

// ── needsLoggedInBrowser ─────────────────────────────────────────────────

describe('needsLoggedInBrowser', () => {
  it('flags possessive/session language', () => {
    expect(needsLoggedInBrowser('check my calendar for open houses')).toBe(true);
    expect(needsLoggedInBrowser('log in and check messages')).toBe(true);
  });

  it('flags well-known login-only surfaces, including inside a URL', () => {
    expect(needsLoggedInBrowser('open gmail and read the latest email')).toBe(true);
    expect(needsLoggedInBrowser('https://gmail.com/mail/u/0/')).toBe(true);
    expect(needsLoggedInBrowser('go to the MLS and pull comps')).toBe(true);
    expect(needsLoggedInBrowser('open the client portal')).toBe(true);
  });

  it('does not flag ordinary public-research phrasing', () => {
    expect(needsLoggedInBrowser('search zillow for 3-bed homes in Austin under 600k')).toBe(false);
    expect(needsLoggedInBrowser('https://www.zillow.com/homes/austin-tx')).toBe(false);
  });
});

// ── resolveBrowserRuntime ────────────────────────────────────────────────

describe('resolveBrowserRuntime', () => {
  it('preserves the current-main public headless start when Research Workspace is off', async () => {
    process.env.CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'false';
    process.env.NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'false';
    process.env.CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS = '';

    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'search zillow for public listings',
      // This preference belongs to the additive Research Workspace and must be
      // inert while that per-space rollout is off.
      preferHeadlessForPublic: true,
    });

    expect('source' in result && result.source).toBe('headless');
    expect('researchWorkspaceDisabled' in result).toBe(false);
    expect(fake.__tables.BrowserSession).toHaveLength(1);
    expect(fake.__tables.BrowserSession[0].source).toBe('headless');
  });

  it('preserves the current-main public headless reuse when Research Workspace is off', async () => {
    process.env.CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'false';
    process.env.NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED = 'false';
    process.env.CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS = '';
    seedSession({ id: 'legacy-headless', source: 'headless', linkId: null });

    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'read a public county records page',
      preferHeadlessForPublic: true,
    });

    expect('source' in result && result.source).toBe('headless');
    if ('source' in result) expect(result.session.id).toBe('legacy-headless');
    expect('researchWorkspaceDisabled' in result).toBe(false);
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('applies Research Workspace headless preference only for an entitled space', async () => {
    seedSession({ id: 'personal-browser', source: 'extension' });

    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'research public listing history',
      preferHeadlessForPublic: true,
    });

    expect('source' in result && result.source).toBe('headless');
    if ('source' in result) expect(result.session.id).not.toBe('personal-browser');
    expect(fake.__tables.BrowserSession.filter((row) => row.source === 'headless')).toHaveLength(1);
  });

  it('prefers a CONNECTED extension session even when the intent text reads as needing login', async () => {
    seedSession({ source: 'extension' });
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'check my gmail inbox',
    });
    expect('needsExtension' in result).toBe(false);
    if ('source' in result) {
      expect(result.source).toBe('extension');
      expect(result.session.id).toBe('sess_1');
    }
    // No headless session was started.
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('uses a valid extension for login-required work even when a newer cloud session exists', async () => {
    seedSession({ id: 'extension', source: 'extension', startedAt: '2026-07-01T00:00:00.000Z', lastPolledAt: new Date().toISOString() });
    seedSession({ id: 'headless', source: 'headless', linkId: null, startedAt: '2026-07-02T00:00:00.000Z', lastPolledAt: new Date().toISOString() });
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1', userId: 'user_1', intentText: 'check my gmail inbox',
    });
    expect('source' in result && result.source).toBe('extension');
    if ('source' in result) expect(result.session.id).toBe('extension');
  });

  it('reuses an already-active headless session instead of starting a new one', async () => {
    seedSession({ id: 'sess_headless', source: 'headless', linkId: null });
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'search zillow for listings',
    });
    expect('needsExtension' in result).toBe(false);
    if ('source' in result) {
      expect(result.source).toBe('headless');
      expect(result.session.id).toBe('sess_headless');
    }
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('does NOT reuse an active headless session for a login-required goal — asks for the extension', async () => {
    // The honesty invariant: an active headless (anonymous cloud) session must
    // not be silently reused to run a goal that needs the realtor's own login.
    seedSession({ id: 'sess_headless', source: 'headless', linkId: null });
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'check my gmail inbox for the signed disclosure',
    });
    expect('needsExtension' in result).toBe(true);
  });

  it('auto-starts a headless session for public-web work when nothing is connected', async () => {
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'search zillow for 3-bed homes in Austin',
    });
    expect('needsExtension' in result).toBe(false);
    if ('source' in result) {
      expect(result.source).toBe('headless');
    }
    expect(fake.__tables.BrowserSession).toHaveLength(1);
    expect(fake.__tables.BrowserSession[0].source).toBe('headless');
    expect(fake.__tables.BrowserSession[0].linkId).toBeNull();
  });

  it('asks honestly for the extension — never falls back to headless — when the goal needs a login and none is connected', async () => {
    const result = await resolveBrowserRuntime({
      spaceId: 'space_1',
      userId: 'user_1',
      intentText: 'check my gmail inbox for new leads',
    });
    expect('needsExtension' in result).toBe(true);
    if ('needsExtension' in result) {
      expect(result.reason.toLowerCase()).toContain('extension');
    }
    // Crucially: no headless session was started as a silent fallback.
    expect(fake.__tables.BrowserSession).toHaveLength(0);
  });
});

// ── startHeadlessSession / endHeadlessSession ───────────────────────────

describe('startHeadlessSession', () => {
  it('creates a source=headless session with a null linkId', async () => {
    const session = await startHeadlessSession({ spaceId: 'space_1', userId: 'user_1' });
    expect(session.source).toBe('headless');
    expect(session.linkId).toBeNull();
    expect(session.status).toBe('active');
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('reuses a live existing headless session rather than creating a second one', async () => {
    const first = await startHeadlessSession({ spaceId: 'space_1', userId: 'user_1' });
    const second = await startHeadlessSession({ spaceId: 'space_1', userId: 'user_1' });
    expect(second.id).toBe(first.id);
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('replaces a STALE headless session with a fresh one instead of reusing it', async () => {
    const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    seedSession({ id: 'sess_stale', source: 'headless', linkId: null, startedAt: staleAt, lastPolledAt: staleAt });
    const fresh = await startHeadlessSession({ spaceId: 'space_1', userId: 'user_1' });
    expect(fresh.id).not.toBe('sess_stale');
    const stale = fake.__tables.BrowserSession.find((r) => r.id === 'sess_stale');
    expect(stale?.status).toBe('ended');
  });

  it('never reuses another user\'s headless session', async () => {
    seedSession({ id: 'sess_other_user', source: 'headless', linkId: null, userId: 'user_2' });
    const session = await startHeadlessSession({ spaceId: 'space_1', userId: 'user_1' });
    expect(session.id).not.toBe('sess_other_user');
  });
});

describe('endHeadlessSession', () => {
  it('marks a headless session ended', async () => {
    seedSession({ id: 'sess_h', source: 'headless', linkId: null });
    await endHeadlessSession('sess_h', { spaceId: 'space_1' });
    expect(fake.__tables.BrowserSession[0].status).toBe('ended');
  });

  it('does not end a DIFFERENT space\'s session of the same id', async () => {
    seedSession({ id: 'sess_h', source: 'headless', linkId: null, spaceId: 'space_victim' });
    await endHeadlessSession('sess_h', { spaceId: 'space_attacker' });
    expect(fake.__tables.BrowserSession[0].status).toBe('active');
  });
});

// ── immutable resolved-session queue authority ───────────────────────────

describe('enqueueActionForSession', () => {
  it('denies an unsafe headless action before inserting any durable queue row', async () => {
    seedSession({ id: 'sess_headless', source: 'headless', linkId: null });

    const result = await enqueueActionForSession({
      spaceId: 'space_1',
      userId: 'user_1',
      sessionId: 'sess_headless',
      input: { type: 'type', selector: '#search', text: 'must not queue' },
    });

    expect(result).toEqual({ error: 'headless_action_blocked' });
    expect(fake.__tables.BrowserAction ?? []).toHaveLength(0);
  });

  it('does not change extension behavior for the equivalent action', async () => {
    seedSession({ id: 'sess_extension', source: 'extension' });

    const result = await enqueueActionForSession({
      spaceId: 'space_1',
      userId: 'user_1',
      sessionId: 'sess_extension',
      input: { type: 'type', selector: '#search', text: 'allowed in paired browser' },
    });

    expect('actionId' in result).toBe(true);
    expect(fake.__tables.BrowserAction).toHaveLength(1);
    expect(fake.__tables.BrowserAction[0]).toMatchObject({
      sessionId: 'sess_extension', type: 'type', status: 'queued',
    });
  });
});

// ── getHeadlessSessionById ───────────────────────────────────────────────

describe('getHeadlessSessionById', () => {
  it('finds a headless session by id without requiring a spaceId (the id IS the capability check)', async () => {
    seedSession({ id: 'sess_h', source: 'headless', linkId: null, spaceId: 'space_9' });
    const found = await getHeadlessSessionById('sess_h');
    expect(found?.id).toBe('sess_h');
    expect(found?.spaceId).toBe('space_9');
  });

  it('returns null for a session that exists but is source=extension, not headless', async () => {
    seedSession({ id: 'sess_ext', source: 'extension' });
    const found = await getHeadlessSessionById('sess_ext');
    expect(found).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    const found = await getHeadlessSessionById('does_not_exist');
    expect(found).toBeNull();
  });
});

// ── recordHeadlessActionResult ───────────────────────────────────────────

describe('recordHeadlessActionResult', () => {
  it('marks the action done when it belongs to the reporting session', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_h', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    await recordHeadlessActionResult('act_1', { spaceId: 'space_1', sessionId: 'sess_h' }, { ok: true, summary: 'Opened page' });
    expect(fake.__tables.BrowserAction[0].status).toBe('done');
    expect(fake.__tables.BrowserAction[0].result).toEqual({ ok: true, summary: 'Opened page' });
  });

  it('ignores an action that belongs to a DIFFERENT session (spoofed report)', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_1', sessionId: 'sess_victim', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    await recordHeadlessActionResult('act_1', { spaceId: 'space_1', sessionId: 'sess_attacker' }, { ok: true, summary: 'attacker-controlled' });
    expect(fake.__tables.BrowserAction[0].status).toBe('running');
    expect(fake.__tables.BrowserAction[0].result).toBeNull();
  });

  it('cross-tenant: scoping to the wrong spaceId leaves the victim\'s row untouched', async () => {
    fake.__tables.BrowserAction = [{
      id: 'act_1', spaceId: 'space_victim', sessionId: 'sess_h', status: 'running',
      result: null, createdAt: new Date().toISOString(),
    }];
    await recordHeadlessActionResult('act_1', { spaceId: 'space_attacker', sessionId: 'sess_h' }, { ok: true, summary: 'nope' });
    expect(fake.__tables.BrowserAction[0].status).toBe('running');
  });
});

// ── getActiveSession returns source (no regression) ─────────────────────

describe('getActiveSession exposes source', () => {
  it('reports source=headless for an active headless session', async () => {
    seedSession({ id: 'sess_h', source: 'headless', linkId: null });
    const active = await getActiveSession('space_1', 'user_1');
    expect(active?.source).toBe('headless');
  });

  it('reports source=extension for an active extension session (default row shape)', async () => {
    seedSession({ id: 'sess_e', source: 'extension' });
    const active = await getActiveSession('space_1', 'user_1');
    expect(active?.source).toBe('extension');
  });
});
