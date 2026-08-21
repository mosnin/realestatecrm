/**
 * Behavioral IDOR locks for Cycle 7 leftovers: tour convert, MCP OAuth
 * authorize, and studio edit. Cross-tenant ids / foreign workspace must
 * 404 (no existence oracle) and must not leak victim PII.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireSpaceOwner: vi.fn(),
  requireActiveSubscription: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/mcp/redirect-allowlist', () => ({
  isAllowedOAuthRedirect: vi.fn(() => true),
}));

type TableResult = { data?: unknown; error?: unknown; count?: number | null };
const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const insertCalls: { table: string; payload: unknown }[] = [];

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: null };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'order', 'limit', 'in', 'upsert', 'not', 'is', 'neq', 'gt', 'gte', 'range', 'ilike'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.insert = vi.fn((payload: unknown) => {
    insertCalls.push({ table, payload });
    return chain;
  });
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => makeChain(table)),
  },
}));

import { POST as convertTour } from '@/app/api/tours/convert/route';
import { POST as authorizeMcp } from '@/app/api/mcp/oauth/authorize/route';
import { POST as studioEdit } from '@/app/api/studio/edit/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  insertCalls.length = 0;
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
  mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

function noPii(body: string) {
  expect(body).not.toContain('VICTIM');
  expect(body).not.toContain('555-0100');
  expect(body).not.toContain('$500,000');
  expect(body).not.toContain('secret.pdf');
  expect(body).not.toContain('signer@victim.com');
  expect(body).not.toContain('123 Victim Lane');
  expect(body).not.toContain('Forbidden');
}

describe('POST /api/tours/convert — Tour scoped before Deal insert', () => {
  it('404s a foreign tourId and does not insert a deal', async () => {
    seed('Tour', { data: null });

    const res = await convertTour(
      new NextRequest('http://localhost/api/tours/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'jane', tourId: 'tour_victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'Deal')).toHaveLength(0);
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('POST /api/mcp/oauth/authorize — workspace + client scoped', () => {
  it('404s when the caller has no workspace and does not insert a code', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);

    const res = await authorizeMcp(
      new NextRequest('http://localhost/api/mcp/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client_victim',
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          code_challenge: 'abc',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'McpAuthCode')).toHaveLength(0);
  });

  it('400s a foreign client_id and does not insert a code', async () => {
    seed('McpApiKey', { data: { spaceId: 'space_victim', expiresAt: null } });

    const res = await authorizeMcp(
      new NextRequest('http://localhost/api/mcp/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client_victim',
          redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
          code_challenge: 'abc',
        }),
      }),
    );
    expect(res.status).toBe(400);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'McpAuthCode')).toHaveLength(0);
  });
});

describe('POST /api/studio/edit — no workspace is not Forbidden', () => {
  it('404s when the caller has no workspace and does not insert a File', async () => {
    mockGetSpaceForUser.mockResolvedValue(null);

    const res = await studioEdit(new NextRequest('http://localhost/api/studio/edit', { method: 'POST' }));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'File')).toHaveLength(0);
  });
});
