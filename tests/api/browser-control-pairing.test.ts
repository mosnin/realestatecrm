/**
 * Behavioral tests for lib/browser-control/auth.ts — pairing-code issue →
 * redeem → bearer-token auth. Drives the real functions against an in-memory
 * fake Supabase client (no network, no real DB) so the tests exercise actual
 * hashing/expiry/single-use logic rather than a source-grep.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// ── In-memory fake Supabase (per-table array store, PostgREST-ish chain) ───

type Row = Record<string, unknown>;

function makeFakeSupabase() {
  const tables: Record<string, Row[]> = {};
  const table = (name: string) => (tables[name] ??= []);

  function from(name: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' | null = null;
    let insertRows: Row[] = [];
    let updateValues: Row = {};
    const filters: Array<(r: Row) => boolean> = [];

    const api: Record<string, unknown> = {
      select: () => { op = op ?? 'select'; return api; },
      insert: (values: Row | Row[]) => { op = 'insert'; insertRows = Array.isArray(values) ? values : [values]; return api; },
      update: (values: Row) => { op = 'update'; updateValues = values; return api; },
      delete: () => { op = 'delete'; return api; },
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; },
      is: (col: string, val: unknown) => { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return api; },
      order: () => api,
      limit: () => api,
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
      return { data: single ? matched[0] ?? null : matched, error: null };
    }

    return api;
  }

  return { from, __tables: tables };
}

const fake = makeFakeSupabase();
vi.mock('@/lib/supabase', () => ({ supabase: new Proxy({}, { get: (_t, p) => (fake as unknown as Record<string, unknown>)[p as string] }) }));

import { EXT_TOKEN_PREFIX } from '@/lib/browser-control/protocol';
import { issuePairingCode, redeemPairingCode, verifyExtToken } from '@/lib/browser-control/auth';

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

beforeEach(() => {
  for (const key of Object.keys(fake.__tables)) fake.__tables[key].length = 0;
});

describe('issuePairingCode → redeemPairingCode happy path', () => {
  it('mints a token exactly once and hashes both the code and token', async () => {
    const { code, expiresAt } = await issuePairingCode({ spaceId: 'space_1', userId: 'user_1' });
    expect(code).toHaveLength(8);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Only the hash is persisted — never the raw code.
    const pairingRow = fake.__tables.BrowserPairingCode[0];
    expect(pairingRow.codeHash).toBe(sha256(code.trim().toUpperCase()));
    expect(pairingRow).not.toHaveProperty('code');

    const result = await redeemPairingCode(code, { deviceLabel: 'Chrome on Bob-Laptop' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.token.startsWith(EXT_TOKEN_PREFIX)).toBe(true);
    expect(result.spaceId).toBe('space_1');
    expect(result.userId).toBe('user_1');

    // Only the hash is persisted on the link — never the raw token.
    const linkRow = fake.__tables.BrowserLink[0];
    expect(linkRow.tokenHash).toBe(sha256(result.token));
    expect(linkRow).not.toHaveProperty('token');
    expect(linkRow.deviceLabel).toBe('Chrome on Bob-Laptop');

    // Single-use: the code is now marked redeemed.
    expect(fake.__tables.BrowserPairingCode[0].redeemedAt).toBeTruthy();
  });

  it('redeeming the same code twice fails the second time', async () => {
    const { code } = await issuePairingCode({ spaceId: 'space_1', userId: 'user_1' });
    const first = await redeemPairingCode(code, {});
    expect(first.ok).toBe(true);

    const second = await redeemPairingCode(code, {});
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.error).toBe('invalid_code');

    // Still only one link minted.
    expect(fake.__tables.BrowserLink).toHaveLength(1);
  });
});

describe('redeemPairingCode rejections', () => {
  it('rejects a code that was never issued', async () => {
    const result = await redeemPairingCode('ZZZZZZZZ', {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('invalid_code');
  });

  it('rejects an expired code', async () => {
    // Seed an already-expired pairing code directly (bypassing the TTL
    // constant so the test doesn't need to sleep).
    const code = 'EXPIRD01';
    fake.__tables.BrowserPairingCode.push({
      id: 'pc_1',
      spaceId: 'space_1',
      userId: 'user_1',
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      redeemedAt: null,
    });

    const result = await redeemPairingCode(code, {});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBe('expired_code');
    expect(fake.__tables.BrowserLink).toHaveLength(0);
  });

  it('is case-insensitive on the code the user types', async () => {
    const { code } = await issuePairingCode({ spaceId: 'space_1', userId: 'user_1' });
    const result = await redeemPairingCode(code.toLowerCase(), {});
    expect(result.ok).toBe(true);
  });
});

describe('verifyExtToken', () => {
  async function pairedToken() {
    const { code } = await issuePairingCode({ spaceId: 'space_1', userId: 'user_1' });
    const result = await redeemPairingCode(code, {});
    if (!result.ok) throw new Error('setup failed');
    return result.token;
  }

  it('resolves a valid bearer token to its link', async () => {
    const token = await pairedToken();
    const resolved = await verifyExtToken(`Bearer ${token}`);
    expect(resolved?.link.spaceId).toBe('space_1');
    expect(resolved?.link.userId).toBe('user_1');
  });

  it('updates lastUsedAt on successful auth (best-effort)', async () => {
    const token = await pairedToken();
    await verifyExtToken(`Bearer ${token}`);
    // The update is fire-and-forget — flush a microtask turn.
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.__tables.BrowserLink[0].lastUsedAt).toBeTruthy();
  });

  it('rejects a missing or malformed Authorization header', async () => {
    expect(await verifyExtToken(null)).toBeNull();
    expect(await verifyExtToken(undefined)).toBeNull();
    expect(await verifyExtToken('Bearer')).toBeNull();
    expect(await verifyExtToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(await verifyExtToken('Bearer not_a_chippi_token')).toBeNull();
  });

  it('rejects a well-formed but unknown token', async () => {
    const fakeToken = `${EXT_TOKEN_PREFIX}${'a'.repeat(48)}`;
    expect(await verifyExtToken(`Bearer ${fakeToken}`)).toBeNull();
  });

  it('rejects a revoked link', async () => {
    const token = await pairedToken();
    fake.__tables.BrowserLink[0].revokedAt = new Date().toISOString();
    expect(await verifyExtToken(`Bearer ${token}`)).toBeNull();
  });
});
