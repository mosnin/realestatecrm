/**
 * Behavioral IDOR locks for write/read paths that used to fetch or mutate
 * tenant rows by id only (JS ownership check, then an unscoped write).
 *
 * Cross-tenant ids must 404 (no existence oracle) and must never write.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireContactAccess: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

vi.mock('@/lib/email', () => ({
  sendStatusUpdateEmail: vi.fn(async () => undefined),
}));

type TableResult = { data?: unknown; error?: unknown };

const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];

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
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'delete', 'upsert', 'not', 'is', 'neq'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { POST as approvalsPost } from '@/app/api/agent/approvals/route';
import { PATCH as applicationStatusPatch } from '@/app/api/applications/[id]/status/route';
import { GET as tourPrepGet } from '@/app/api/tours/[id]/prep/route';
import { requireAuth, requireContactAccess } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireContactAccess = vi.mocked(requireContactAccess);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

function approvalsReq(body: unknown) {
  return new NextRequest('http://localhost/api/agent/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/agent/approvals — AgentTask scoped to caller space', () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  });

  it('404s a cross-tenant taskId and does not write', async () => {
    seed('AgentTask', { data: null });

    const res = await approvalsPost(
      approvalsReq({ taskId: 'task_victim', action: 'approve' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(eqOn('AgentTask', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(updateCalls.filter((u) => u.table === 'AgentTask')).toHaveLength(0);
  });

  it('scopes the approve write to space.id', async () => {
    seed('AgentTask', {
      data: { id: 'task_mine', spaceId: 'space_caller', status: 'paused', metadata: { approvalRequired: true } },
    });
    seed('AgentTask', {
      data: { id: 'task_mine', spaceId: 'space_caller', status: 'queued', metadata: { approvedAt: 'x' } },
    });

    const res = await approvalsPost(approvalsReq({ taskId: 'task_mine', action: 'approve' }));
    expect(res.status).toBe(200);
    expect(eqOn('AgentTask', 'spaceId').every((c) => c.value === 'space_caller')).toBe(true);
    const writes = updateCalls.filter((u) => u.table === 'AgentTask');
    expect(writes).toHaveLength(1);
    expect((writes[0].payload as { status: string }).status).toBe('queued');
  });
});

describe('PATCH /api/applications/[id]/status — Contact write scoped', () => {
  beforeEach(() => {
    mockRequireContactAccess.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
  });

  it('404s a foreign contact and does not update', async () => {
    seed('Contact', { data: null });

    const res = await applicationStatusPatch(
      new NextRequest('http://localhost/api/applications/c_victim/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'c_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(updateCalls.filter((u) => u.table === 'Contact')).toHaveLength(0);
  });

  it('scopes the Contact status write to the caller space', async () => {
    seed('Contact', {
      data: {
        applicationStatus: 'received',
        email: 'a@x.com',
        name: 'Ada',
        spaceId: 'space_caller',
        applicationRef: 'ref-1',
      },
    });

    const res = await applicationStatusPatch(
      new NextRequest('http://localhost/api/applications/c_mine/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'c_mine' }) },
    );
    expect(res.status).toBe(200);
    expect(eqOn('Contact', 'spaceId').every((c) => c.value === 'space_caller')).toBe(true);
    expect(updateCalls.filter((u) => u.table === 'Contact')).toHaveLength(1);
  });
});

describe('GET /api/tours/[id]/prep — Tour + Contact scoped, no 403 oracle', () => {
  beforeEach(() => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  });

  it('404s a cross-tenant tourId (not 403) and does not read Contact', async () => {
    seed('Tour', { data: null });

    const res = await tourPrepGet(new NextRequest('http://localhost/api/tours/tour_victim/prep'), {
      params: Promise.resolve({ id: 'tour_victim' }),
    });
    expect(res.status).toBe(404);
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('Contact', 'spaceId')).toHaveLength(0);
  });

  it('scopes the linked Contact read to the caller space', async () => {
    seed('Tour', {
      data: {
        id: 'tour_mine',
        spaceId: 'space_caller',
        contactId: 'c_mine',
        guestName: 'Sam',
        guestEmail: 'sam@x.com',
        guestPhone: null,
        propertyAddress: '1 Main',
        startsAt: '2026-07-01T10:00:00Z',
        endsAt: '2026-07-01T11:00:00Z',
      },
    });
    seed('SpaceSetting', { data: { timezone: 'America/New_York' } });
    seed('Contact', { data: { id: 'c_mine', spaceId: 'space_caller', name: 'Sam', budget: 2000 } });
    seed('Tour', { data: null });

    const res = await tourPrepGet(new NextRequest('http://localhost/api/tours/tour_mine/prep'), {
      params: Promise.resolve({ id: 'tour_mine' }),
    });
    expect(res.status).toBe(200);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toContain('space_caller');
    const body = await res.json();
    expect(body.guestName).toBe('Sam');
    expect(body.contactHighlights.some((h: string) => h.includes('2,000'))).toBe(true);
  });
});
