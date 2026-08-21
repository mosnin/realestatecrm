/**
 * Behavioral IDOR locks for Cycle 7: agent questions/goals FK checks,
 * deal documents, swarm stream, review-request 403 oracle, deal create
 * stage injection, artifact list spaceId, and vectorize sync.
 *
 * Cross-tenant ids must 404 (no existence oracle) and must not leak victim PII.
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

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/broker-notify', () => ({ notifyBroker: vi.fn() }));
vi.mock('@/lib/notification-voice', () => ({
  notificationForReviewRequested: vi.fn(() => ({ title: 't', description: 'd' })),
}));
vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));
vi.mock('@/lib/chippi/workbench-flag', () => ({
  isWorkbenchEnabled: () => false,
}));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
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
  const passthrough = ['select', 'order', 'limit', 'in', 'upsert', 'not', 'is', 'neq', 'gt', 'gte', 'range'];
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
    rpc: rpcMock,
  },
}));

import { POST as postQuestion } from '@/app/api/agent/questions/route';
import { POST as postGoal } from '@/app/api/agent/goals/route';
import { GET as getDealDocs } from '@/app/api/deals/[id]/documents/route';
import { GET as getSwarmStream } from '@/app/api/swarm/[runId]/stream/route';
import { POST as postReview } from '@/app/api/deals/[id]/review-request/route';
import { POST as postDeal } from '@/app/api/deals/route';
import { GET as listArtifacts } from '@/app/api/agent/artifacts/route';
import { POST as syncVectorize } from '@/app/api/vectorize/sync/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser, getSpaceFromSlug } from '@/lib/space';
import { auth } from '@clerk/nextjs/server';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockGetSpaceFromSlug = vi.mocked(getSpaceFromSlug);
const mockAuth = vi.mocked(auth);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  insertCalls.length = 0;
  rpcMock.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  mockGetSpaceFromSlug.mockResolvedValue(CALLER_SPACE);
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
  mockAuth.mockResolvedValue({ userId: 'u_caller' } as never);
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

describe('POST /api/agent/questions — Contact FK scoped', () => {
  it('404s a foreign contactId and does not insert a question', async () => {
    seed('Contact', { data: null });

    const res = await postQuestion(
      new NextRequest('http://localhost/api/agent/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'Should I call VICTIM at 555-0100?',
          contactId: 'c_victim',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'AgentQuestion')).toHaveLength(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('POST /api/agent/goals — Contact/Deal FK scoped', () => {
  it('404s a foreign contactId and does not insert a goal', async () => {
    seed('Contact', { data: null });

    const res = await postGoal(
      new NextRequest('http://localhost/api/agent/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalType: 'follow_up_sequence',
          description: 'Chase VICTIM',
          contactId: 'c_victim',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'AgentGoal')).toHaveLength(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('404s a foreign dealId and does not insert a goal', async () => {
    seed('Deal', { data: null });

    const res = await postGoal(
      new NextRequest('http://localhost/api/agent/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalType: 'deal_close',
          description: 'Close $500,000 on 123 Victim Lane',
          dealId: 'deal_victim',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'AgentGoal')).toHaveLength(0);
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/deals/[id]/documents — Deal scoped before list', () => {
  it('404s a foreign deal and does not list documents', async () => {
    seed('Deal', { data: null });

    const res = await getDealDocs(
      new NextRequest('http://localhost/api/deals/deal_victim/documents'),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('DealDocument', 'dealId')).toHaveLength(0);
  });
});

describe('GET /api/swarm/[runId]/stream — SwarmRun scoped', () => {
  it('404s a foreign run before the stream opens', async () => {
    seed('SwarmRun', { data: null });

    const res = await getSwarmStream(
      new NextRequest('http://localhost/api/swarm/swarm_victim/stream'),
      { params: Promise.resolve({ runId: 'swarm_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('SwarmRun', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('POST /api/deals/[id]/review-request — no 403 existence oracle', () => {
  it('404s when the caller cannot access the deal space', async () => {
    seed('Deal', {
      data: {
        id: 'deal_victim',
        title: 'VICTIM $500,000',
        spaceId: 'space_victim',
        Space: { id: 'space_victim', slug: 'victim', brokerageId: 'b_victim' },
      },
    });
    mockRequireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await postReview(
      new NextRequest('http://localhost/api/deals/deal_victim/review-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'please review secret.pdf' }),
      }),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'DealReviewRequest')).toHaveLength(0);
  });
});

describe('POST /api/deals — stage injection scoped', () => {
  it('400s a foreign stage and does not insert a deal', async () => {
    seed('DealStage', { data: null });

    const res = await postDeal(
      new NextRequest('http://localhost/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'jane',
          title: 'Stolen $500,000 on 123 Victim Lane',
          stageId: 'stage_victim',
        }),
      }),
    );
    expect(res.status).toBe(400);
    noPii(JSON.stringify(await res.json()));
    expect(insertCalls.filter((c) => c.table === 'Deal')).toHaveLength(0);
    expect(eqOn('DealStage', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/agent/artifacts — spaceId must match caller', () => {
  it('404s a foreign spaceId and does not list artifacts', async () => {
    const res = await listArtifacts(
      new NextRequest('http://localhost/api/agent/artifacts?spaceId=space_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Artifact', 'spaceId')).toHaveLength(0);
  });
});

describe('POST /api/vectorize/sync — slug must match caller space', () => {
  it('404s a foreign slug and does not read contacts or deals', async () => {
    mockGetSpaceFromSlug.mockResolvedValue({
      id: 'space_victim',
      slug: 'victim',
      name: 'Victim',
      ownerId: 'u_victim',
    } as never);

    const res = await syncVectorize(
      new NextRequest('http://localhost/api/vectorize/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Contact', 'spaceId')).toHaveLength(0);
    expect(eqOn('Deal', 'spaceId')).toHaveLength(0);
  });
});
