/**
 * Behavioral tests for the screencast/kill/rotation additions to
 * lib/browser-control/{session.ts,auth.ts}:
 *   - recordPollHeartbeat / getLatestFrame (latest-frame-only storage)
 *   - getActiveSession treating a stale (no recent poll) session as ended
 *   - rotateToken (revoke old bearer token + mint a fresh one in place)
 *
 * Drives the real functions against an in-memory fake Supabase client, same
 * pattern as browser-control-queue.test.ts / browser-control-pairing.test.ts.
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
  getActiveSession,
  recordPollHeartbeat,
  getLatestFrame,
} from '@/lib/browser-control/session';
import { rotateToken, verifyExtToken, issuePairingCode, redeemPairingCode } from '@/lib/browser-control/auth';
import { ACTION_TTL_SECONDS } from '@/lib/browser-control/protocol';

function seedActiveSession(overrides: Partial<Row> = {}) {
  const row: Row = {
    id: 'sess_1',
    spaceId: 'space_1',
    userId: 'user_1',
    linkId: 'link_1',
    status: 'active',
    startedAt: new Date().toISOString(),
    endedAt: null,
    lastPolledAt: new Date().toISOString(),
    lastFrame: null,
    lastFrameAt: null,
    ...overrides,
  };
  fake.__tables.BrowserSession ??= [];
  fake.__tables.BrowserSession.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(fake.__tables)) fake.__tables[key].length = 0;
});

// ── recordPollHeartbeat / getLatestFrame ────────────────────────────────────

describe('recordPollHeartbeat + getLatestFrame', () => {
  it('stores the LATEST frame only — overwrites rather than accumulates', async () => {
    seedActiveSession();

    await recordPollHeartbeat('sess_1', { spaceId: 'space_1' }, { image: 'data:image/jpeg;base64,AAA', pageUrl: 'https://a.example/1', pageTitle: 'First' });
    const afterFirst = await getLatestFrame('space_1', 'user_1');
    expect(afterFirst?.pageUrl).toBe('https://a.example/1');

    await recordPollHeartbeat('sess_1', { spaceId: 'space_1' }, { image: 'data:image/jpeg;base64,BBB', pageUrl: 'https://a.example/2', pageTitle: 'Second' });
    const afterSecond = await getLatestFrame('space_1', 'user_1');
    expect(afterSecond?.pageUrl).toBe('https://a.example/2');
    expect(afterSecond?.image).toBe('data:image/jpeg;base64,BBB');

    // Only one BrowserSession row exists throughout — no accumulation table.
    expect(fake.__tables.BrowserSession).toHaveLength(1);
  });

  it('a heartbeat with no frame updates lastPolledAt but leaves the stored frame untouched', async () => {
    seedActiveSession({ lastFrame: { image: 'data:image/jpeg;base64,KEEP' }, lastFrameAt: new Date().toISOString() });
    await recordPollHeartbeat('sess_1', { spaceId: 'space_1' }); // no frame arg
    const frame = await getLatestFrame('space_1', 'user_1');
    expect(frame?.image).toBe('data:image/jpeg;base64,KEEP');
  });

  it('returns null honestly when the session has no active session at all', async () => {
    const frame = await getLatestFrame('space_1', 'user_1');
    expect(frame).toBeNull();
  });

  it('returns null when the session is active but no frame has been pushed yet', async () => {
    seedActiveSession();
    const frame = await getLatestFrame('space_1', 'user_1');
    expect(frame).toBeNull();
  });

  it('never leaks another user\'s frame (cross-tenant / cross-user isolation)', async () => {
    seedActiveSession({ userId: 'user_victim', lastFrame: { image: 'data:image/jpeg;base64,SECRET' }, lastFrameAt: new Date().toISOString() });
    const frame = await getLatestFrame('space_1', 'user_attacker');
    expect(frame).toBeNull();
  });
});

// ── getActiveSession — stale session treated as ended ───────────────────────

describe('getActiveSession — staleness', () => {
  it('reports a fresh (recently polled) session as active', async () => {
    seedActiveSession({ lastPolledAt: new Date().toISOString() });
    const session = await getActiveSession('space_1', 'user_1');
    expect(session?.id).toBe('sess_1');
    expect(fake.__tables.BrowserSession[0].status).toBe('active');
  });

  it('lazily ends a session with no poll in ACTION_TTL_SECONDS*2 and reports it as absent', async () => {
    const staleAt = new Date(Date.now() - (ACTION_TTL_SECONDS * 2 + 30) * 1000).toISOString();
    seedActiveSession({ startedAt: staleAt, lastPolledAt: staleAt });

    const session = await getActiveSession('space_1', 'user_1');
    expect(session).toBeNull();

    // Self-healing: the underlying row was actually flipped to ended, not
    // just hidden from this read.
    const row = fake.__tables.BrowserSession[0];
    expect(row.status).toBe('ended');
    expect(row.endedAt).toBeTruthy();
  });

  it('falls back to startedAt when lastPolledAt was never recorded (pre-migration row)', async () => {
    const oldStart = new Date(Date.now() - (ACTION_TTL_SECONDS * 2 + 30) * 1000).toISOString();
    seedActiveSession({ startedAt: oldStart, lastPolledAt: null });
    const session = await getActiveSession('space_1', 'user_1');
    expect(session).toBeNull();
  });

  it('a session just under the staleness threshold is still reported active', async () => {
    const recentAt = new Date(Date.now() - (ACTION_TTL_SECONDS * 2 - 20) * 1000).toISOString();
    seedActiveSession({ lastPolledAt: recentAt });
    const session = await getActiveSession('space_1', 'user_1');
    expect(session).not.toBeNull();
  });
});

// ── rotateToken ──────────────────────────────────────────────────────────

describe('rotateToken', () => {
  async function pairedLink() {
    const { code } = await issuePairingCode({ spaceId: 'space_1', userId: 'user_1' });
    const result = await redeemPairingCode(code, {});
    if (!result.ok) throw new Error('setup failed');
    return result;
  }

  it('mints a fresh token, invalidating the old one immediately', async () => {
    const { token: oldToken, linkId, spaceId } = await pairedLink();

    // Old token works before rotation.
    expect((await verifyExtToken(`Bearer ${oldToken}`))?.link.id).toBe(linkId);

    const rotated = await rotateToken(linkId, { spaceId });
    expect(rotated).not.toBeNull();
    expect(rotated!.token.startsWith('chippi_ext_')).toBe(true);
    expect(rotated!.token).not.toBe(oldToken);

    // Old token is now dead...
    expect(await verifyExtToken(`Bearer ${oldToken}`)).toBeNull();
    // ...new token resolves to the SAME link id (session/queue continuity).
    const resolved = await verifyExtToken(`Bearer ${rotated!.token}`);
    expect(resolved?.link.id).toBe(linkId);

    // Raw token is never persisted — only its hash.
    const linkRow = fake.__tables.BrowserLink.find((r) => r.id === linkId);
    expect(linkRow).not.toHaveProperty('token');
  });

  it('returns null for a link in a DIFFERENT space (cross-tenant block)', async () => {
    const { linkId } = await pairedLink();
    const rotated = await rotateToken(linkId, { spaceId: 'space_attacker' });
    expect(rotated).toBeNull();
  });

  it('returns null for an already-revoked link — nothing to rotate', async () => {
    const { linkId, spaceId } = await pairedLink();
    fake.__tables.BrowserLink[0].revokedAt = new Date().toISOString();
    const rotated = await rotateToken(linkId, { spaceId });
    expect(rotated).toBeNull();
  });

  it('returns null for a nonexistent link', async () => {
    const rotated = await rotateToken('does_not_exist', { spaceId: 'space_1' });
    expect(rotated).toBeNull();
  });
});
