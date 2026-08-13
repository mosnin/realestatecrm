import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { requireAuthMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(async () => ({ userId: 'clerk_1' })),
}));
vi.mock('@/lib/api-auth', () => ({ requireAuth: requireAuthMock }));

const { getSpaceForUserMock } = vi.hoisted(() => ({
  getSpaceForUserMock: vi.fn(async () => ({ id: 'space_1', slug: 'acme' })),
}));
vi.mock('@/lib/space', () => ({ getSpaceForUser: getSpaceForUserMock }));

const { getCurrentDbUserMock } = vi.hoisted(() => ({
  getCurrentDbUserMock: vi.fn(async () => ({ id: 'user_1', clerkId: 'clerk_1' })),
}));
vi.mock('@/lib/permissions', () => ({ getCurrentDbUser: getCurrentDbUserMock }));

const { enabledMock } = vi.hoisted(() => ({ enabledMock: vi.fn(() => true) }));
vi.mock('@/lib/chippi/research-workspace-flag', () => ({
  isResearchWorkspaceEnabledForSpace: enabledMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

type Row = Record<string, unknown>;
let sessions: Row[] = [];
let actions: Row[] = [];
const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];
const selectCalls: Array<{ table: string; columns: string | undefined }> = [];
const limitCalls: Array<{ table: string; count: number }> = [];
const fromMock = vi.hoisted(() => vi.fn());

function rowsFor(table: string): Row[] {
  return table === 'BrowserSession' ? sessions : table === 'BrowserAction' ? actions : [];
}

function makeChain(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const chain: Record<string, unknown> = {};
  const execute = async () => ({ data: rowsFor(table).filter((row) => filters.every((filter) => filter(row))), error: null });
  chain.select = (columns?: string) => { selectCalls.push({ table, columns }); return chain; };
  chain.eq = (column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    filters.push((row) => row[column] === value);
    return chain;
  };
  chain.in = (column: string, values: unknown[]) => {
    inCalls.push({ table, column, values });
    filters.push((row) => values.includes(row[column]));
    return chain;
  };
  chain.order = () => chain;
  chain.limit = (count: number) => { limitCalls.push({ table, count }); return chain; };
  chain.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => execute().then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import { GET } from '@/app/api/browser-control/actions/route';

function request() {
  return new NextRequest('http://test.local/api/browser-control/actions');
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUserMock.mockResolvedValue({ id: 'space_1', slug: 'acme' });
  getCurrentDbUserMock.mockResolvedValue({ id: 'user_1', clerkId: 'clerk_1' });
  enabledMock.mockReturnValue(true);
  sessions = [];
  actions = [];
  eqCalls.length = 0;
  inCalls.length = 0;
  selectCalls.length = 0;
  limitCalls.length = 0;
  fromMock.mockImplementation((table: string) => makeChain(table));
});

describe('GET /api/browser-control/actions', () => {
  it('returns 404 before querying browser data when the workspace is not entitled', async () => {
    enabledMock.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('scopes sessions by exact space and user, then exposes only bounded headless outcomes', async () => {
    sessions = [
      { id: 'headless_here', spaceId: 'space_1', userId: 'user_1', source: 'headless' },
      { id: 'extension_here', spaceId: 'space_1', userId: 'user_1', source: 'extension' },
      { id: 'headless_other_user', spaceId: 'space_1', userId: 'user_2', source: 'headless' },
      { id: 'headless_other_space', spaceId: 'space_2', userId: 'user_1', source: 'headless' },
    ];
    actions = [
      {
        id: 'safe_headless_action', sessionId: 'headless_here', spaceId: 'space_1', type: 'read_dom', status: 'done',
        params: { text: 'private typed browser input' }, createdAt: '2026-07-29T00:00:00.000Z', completedAt: null,
        result: { ok: true, summary: 'Read a public listing', pageUrl: 'https://example.com/listing', pageTitle: 'Listing', dom: 'private page DOM', screenshot: 'private screenshot bytes' },
      },
      {
        id: 'extension_action', sessionId: 'extension_here', spaceId: 'space_1', type: 'read_dom', status: 'done',
        params: { text: 'do not leak' }, createdAt: '2026-07-29T00:01:00.000Z', completedAt: null,
        result: { ok: true, summary: 'Paired browser result' },
      },
      {
        id: 'other_space_action', sessionId: 'headless_here', spaceId: 'space_2', type: 'read_dom', status: 'done',
        params: {}, createdAt: '2026-07-29T00:02:00.000Z', completedAt: null,
        result: { ok: true, summary: 'Wrong tenant' },
      },
    ];

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.actions).toEqual([{
      id: 'safe_headless_action', type: 'read_dom', summary: 'Read a public listing',
      timestamp: '2026-07-29T00:00:00.000Z', ok: true, status: 'done', source: 'headless',
      pageUrl: 'https://example.com/listing', pageTitle: 'Listing',
    }]);
    expect(JSON.stringify(body)).not.toContain('params');
    expect(JSON.stringify(body)).not.toContain('private typed browser input');
    expect(JSON.stringify(body)).not.toContain('private page DOM');
    expect(JSON.stringify(body)).not.toContain('private screenshot bytes');
    expect(eqCalls).toContainEqual({ table: 'BrowserSession', column: 'spaceId', value: 'space_1' });
    expect(eqCalls).toContainEqual({ table: 'BrowserSession', column: 'userId', value: 'user_1' });
    expect(eqCalls).toContainEqual({ table: 'BrowserAction', column: 'spaceId', value: 'space_1' });
    expect(inCalls).toContainEqual({ table: 'BrowserAction', column: 'sessionId', values: ['headless_here'] });
    expect(limitCalls).toContainEqual({ table: 'BrowserAction', count: 24 });
    const actionSelect = selectCalls.find((call) => call.table === 'BrowserAction')?.columns ?? '';
    expect(actionSelect).not.toContain('params');
  });
});
