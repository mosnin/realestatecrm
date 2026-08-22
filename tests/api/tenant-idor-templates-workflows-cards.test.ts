/**
 * Behavioral IDOR locks for the next highest-risk tenant resources after
 * CustomAgent / properties / packets / memories / e-sign / drafts: templates,
 * workflows, chat cards, goals, tour profiles, deal reorder, studio posts,
 * artifacts, client documents, checklists, routines, stages, and timeline.
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
  requireContactAccess: vi.fn(),
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/file'),
  deleteObject: vi.fn(async () => undefined),
  deleteObjectsBestEffort: vi.fn(async () => ({ ok: 0, failed: [] })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/routines', () => ({
  fireRoutineRun: vi.fn(),
  ROUTINE_CADENCES: ['daily', 'weekly', 'monthly', 'custom'],
  ROUTINE_WEEKDAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  ROUTINE_MAX_DAY_OF_MONTH: 28,
}));
vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));
vi.mock('@/lib/chippi/workbench-flag', () => ({
  isWorkbenchEnabled: () => false,
}));
vi.mock('@/lib/integrations/reconcile-workflow-triggers', () => ({
  reconcileWorkflowTriggers: vi.fn(),
}));
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}));

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
type TableResult = { data?: unknown; error?: unknown; count?: number | null };
const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];
const deleteCalls: { table: string }[] = [];

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
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'not', 'is', 'neq', 'gt'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.delete = vi.fn(() => {
    deleteCalls.push({ table });
    return chain;
  });
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

import { PATCH as patchTemplate, DELETE as deleteTemplate } from '@/app/api/message-templates/[id]/route';
import { GET as getWorkflow, PATCH as patchWorkflow, DELETE as deleteWorkflow } from '@/app/api/workflows/[id]/route';
import { GET as getCard } from '@/app/api/cards/[type]/[id]/route';
import { PATCH as patchGoal, DELETE as deleteGoal } from '@/app/api/agent/goals/[id]/route';
import { PATCH as patchTourProperty, DELETE as deleteTourProperty } from '@/app/api/tours/properties/[id]/route';
import { PATCH as reorderDeals } from '@/app/api/deals/reorder/route';
import { DELETE as cancelStudio } from '@/app/api/studio/schedule/route';
import { GET as getArtifact } from '@/app/api/agent/artifacts/[artifactId]/route';
import { GET as getClientDocuments } from '@/app/api/contacts/[id]/client-documents/route';
import { GET as getChecklist } from '@/app/api/deals/[id]/checklist/route';
import { PATCH as patchChecklistItem, DELETE as deleteChecklistItem } from '@/app/api/deals/[id]/checklist/[itemId]/route';
import { PATCH as patchRoutine, DELETE as deleteRoutine } from '@/app/api/routines/[id]/route';
import { PATCH as patchStage, DELETE as deleteStage } from '@/app/api/stages/[id]/route';
import { GET as getTimeline } from '@/app/api/contacts/[id]/timeline/route';
import { GET as getWorkspaceFile } from '@/app/api/workspace-runs/[id]/files/[fileId]/route';
import { PATCH as patchPipeline } from '@/app/api/pipelines/[id]/route';
import { requireAuth, requireContactAccess, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { auth } from '@clerk/nextjs/server';
import { getSignedDownloadUrl } from '@/lib/storage';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireContactAccess = vi.mocked(requireContactAccess);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockAuth = vi.mocked(auth);
const mockSigned = vi.mocked(getSignedDownloadUrl);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  rpcMock.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
  mockAuth.mockResolvedValue({ userId: 'u_caller' } as never);
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
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

describe('PATCH/DELETE /api/message-templates/[id] — MessageTemplate scoped', () => {
  it('PATCH 404s a foreign template and does not write', async () => {
    seed('MessageTemplate', { data: null });

    const res = await patchTemplate(
      new NextRequest('http://localhost/api/message-templates/tpl_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params('tpl_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'MessageTemplate')).toHaveLength(0);
    expect(eqOn('MessageTemplate', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign template and does not delete', async () => {
    seed('MessageTemplate', { data: null });

    const res = await deleteTemplate(
      new NextRequest('http://localhost/api/message-templates/tpl_victim', { method: 'DELETE' }),
      params('tpl_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'MessageTemplate')).toHaveLength(0);
  });
});

describe('GET/PATCH/DELETE /api/workflows/[id] — Workflow scoped', () => {
  it('GET 404s a foreign workflow and does not leak the definition', async () => {
    seed('Workflow', { data: null });

    const res = await getWorkflow(
      new NextRequest('http://localhost/api/workflows/wf_victim'),
      params('wf_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Workflow', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PATCH 404s a foreign workflow and does not write', async () => {
    seed('Workflow', { data: null });

    const res = await patchWorkflow(
      new NextRequest('http://localhost/api/workflows/wf_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen', enabled: false }),
      }),
      params('wf_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Workflow', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign workflow after a space-scoped delete', async () => {
    seed('Workflow', { data: [] });

    const res = await deleteWorkflow(
      new NextRequest('http://localhost/api/workflows/wf_victim', { method: 'DELETE' }),
      params('wf_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Workflow')).toHaveLength(1);
    expect(eqOn('Workflow', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/cards/{deal,property,tour}/[id] — card lookup scoped', () => {
  it('404s a foreign deal card and does not leak the title', async () => {
    seed('Deal', { data: null });

    const res = await getCard(
      new NextRequest('http://localhost/api/cards/deal/deal_victim?spaceId=space_caller'),
      { params: Promise.resolve({ type: 'deal', id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('DealContact', 'dealId')).toHaveLength(0);
  });

  it('404s a foreign property card and does not leak the address', async () => {
    seed('Property', { data: null });

    const res = await getCard(
      new NextRequest('http://localhost/api/cards/property/prop_victim?spaceId=space_caller'),
      { params: Promise.resolve({ type: 'property', id: 'prop_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Property', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('404s a foreign tour card and does not leak guest PII', async () => {
    seed('Tour', { data: null });

    const res = await getCard(
      new NextRequest('http://localhost/api/cards/tour/tour_victim?spaceId=space_caller'),
      { params: Promise.resolve({ type: 'tour', id: 'tour_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/agent/goals/[id] — AgentGoal scoped', () => {
  it('PATCH 404s a foreign goal and does not write', async () => {
    seed('AgentGoal', { data: null });

    const res = await patchGoal(
      new NextRequest('http://localhost/api/agent/goals/goal_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }),
      params('goal_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'AgentGoal')).toHaveLength(0);
    expect(eqOn('AgentGoal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign goal and does not cancel it', async () => {
    seed('AgentGoal', { data: null });

    const res = await deleteGoal(
      new NextRequest('http://localhost/api/agent/goals/goal_victim', { method: 'DELETE' }),
      params('goal_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'AgentGoal')).toHaveLength(0);
  });
});

describe('PATCH/DELETE /api/tours/properties/[id] — TourPropertyProfile scoped', () => {
  it('PATCH 404s a foreign profile and does not write', async () => {
    seed('TourPropertyProfile', { data: null });

    const res = await patchTourProperty(
      new NextRequest('http://localhost/api/tours/properties/tpp_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '123 Victim Lane' }),
      }),
      params('tpp_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'TourPropertyProfile')).toHaveLength(0);
    expect(eqOn('TourPropertyProfile', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign profile and does not delete', async () => {
    seed('TourPropertyProfile', { data: null });

    const res = await deleteTourProperty(
      new NextRequest('http://localhost/api/tours/properties/tpp_victim', { method: 'DELETE' }),
      params('tpp_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'TourPropertyProfile')).toHaveLength(0);
  });
});

describe('PATCH /api/deals/reorder — Deal + DealStage scoped before RPC', () => {
  it('404s a foreign deal and does not call reorder_deal', async () => {
    seed('Deal', { data: null });

    const res = await reorderDeals(
      new NextRequest('http://localhost/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: 'deal_victim', newStageId: 'stage_1', newPosition: 0 }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('404s a foreign stage and does not call reorder_deal', async () => {
    seed('Deal', { data: { id: 'deal_own', spaceId: 'space_caller', stageId: 'stage_own', position: 0 } });
    seed('DealStage', { data: null });

    const res = await reorderDeals(
      new NextRequest('http://localhost/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: 'deal_own', newStageId: 'stage_victim', newPosition: 0 }),
      }),
    );
    expect(res.status).toBe(404);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(eqOn('DealStage', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('DELETE /api/studio/schedule — StudioPost scoped, 404 not 409', () => {
  it('404s a foreign post and does not cancel', async () => {
    seed('StudioPost', { data: null });

    const res = await cancelStudio(
      new NextRequest('http://localhost/api/studio/schedule?id=post_victim', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('can no longer be canceled');
    noPii(body);
    expect(updateCalls.filter((u) => u.table === 'StudioPost')).toHaveLength(0);
    expect(eqOn('StudioPost', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/agent/artifacts/[artifactId] — Artifact scoped', () => {
  it('404s a foreign artifact and does not leak workbook content', async () => {
    seed('Artifact', { data: null });

    const res = await getArtifact(
      new NextRequest('http://localhost/api/agent/artifacts/art_victim'),
      { params: Promise.resolve({ artifactId: 'art_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Artifact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('ArtifactVersion', 'artifactId')).toHaveLength(0);
  });
});

describe('GET /api/contacts/[id]/client-documents — ClientDocument scoped', () => {
  it('404s a foreign contact before listing documents', async () => {
    mockRequireContactAccess.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));

    const res = await getClientDocuments(
      new NextRequest('http://localhost/api/contacts/c_victim/client-documents'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('ClientDocument', 'spaceId')).toHaveLength(0);
    expect(mockSigned).not.toHaveBeenCalled();
  });

  it('404s a foreign document id and does not sign a URL', async () => {
    mockRequireContactAccess.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE } as never);
    seed('ClientDocument', { data: null });

    const res = await getClientDocuments(
      new NextRequest('http://localhost/api/contacts/c_own/client-documents?id=doc_victim'),
      params('c_own'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(mockSigned).not.toHaveBeenCalled();
    expect(eqOn('ClientDocument', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/deals/[id]/checklist — Deal scoped first', () => {
  it('404s a foreign deal and does not list checklist items', async () => {
    seed('Deal', { data: null });

    const res = await getChecklist(
      new NextRequest('http://localhost/api/deals/deal_victim/checklist'),
      params('deal_victim'),
    );
    expect(res.status).toBe(404);
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('DealChecklistItem', 'dealId')).toHaveLength(0);
  });
});

describe('PATCH/DELETE /api/deals/[id]/checklist/[itemId] — item scoped', () => {
  it('PATCH 404s a foreign deal and does not write', async () => {
    seed('Deal', { data: null });

    const res = await patchChecklistItem(
      new NextRequest('http://localhost/api/deals/deal_victim/checklist/item_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      }),
      { params: Promise.resolve({ id: 'deal_victim', itemId: 'item_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'DealChecklistItem')).toHaveLength(0);
  });

  it('DELETE 404s a foreign deal and does not delete', async () => {
    seed('Deal', { data: null });

    const res = await deleteChecklistItem(
      new NextRequest('http://localhost/api/deals/deal_victim/checklist/item_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'deal_victim', itemId: 'item_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'DealChecklistItem')).toHaveLength(0);
  });
});

describe('PATCH/DELETE /api/routines/[id] — Routine scoped', () => {
  it('PATCH 404s a foreign routine and does not write', async () => {
    seed('Routine', { data: null });

    const res = await patchRoutine(
      new NextRequest('http://localhost/api/routines/rtn_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      params('rtn_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Routine', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign routine and does not delete', async () => {
    seed('Routine', { data: [] });

    const res = await deleteRoutine(
      new NextRequest('http://localhost/api/routines/rtn_victim', { method: 'DELETE' }),
      params('rtn_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Routine')).toHaveLength(1);
    expect(eqOn('Routine', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/stages/[id] — DealStage scoped', () => {
  it('PATCH 404s a foreign stage and does not write', async () => {
    seed('DealStage', { data: [] });

    const res = await patchStage(
      new NextRequest('http://localhost/api/stages/stage_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params('stage_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'DealStage')).toHaveLength(0);
    expect(eqOn('DealStage', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign stage and does not delete', async () => {
    seed('DealStage', { data: [] });

    const res = await deleteStage(
      new NextRequest('http://localhost/api/stages/stage_victim', { method: 'DELETE' }),
      params('stage_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'DealStage')).toHaveLength(0);
    expect(eqOn('Deal', 'spaceId')).toHaveLength(0);
  });
});

describe('GET /api/contacts/[id]/timeline — Contact scoped before child events', () => {
  it('404s a foreign contact and does not query tours or deals', async () => {
    seed('Contact', { data: null });

    const res = await getTimeline(
      new NextRequest('http://localhost/api/contacts/c_victim/timeline'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('Tour', 'contactId')).toHaveLength(0);
    expect(eqOn('DealContact', 'contactId')).toHaveLength(0);
  });
});

describe('GET /api/workspace-runs/[id]/files/[fileId] — run scoped, no completion oracle', () => {
  it('404s a foreign run and does not sign a download', async () => {
    seed('WorkspaceRun', { data: null });

    const res = await getWorkspaceFile(
      new NextRequest('http://localhost/api/workspace-runs/run_victim/files/file_victim?slug=jane'),
      { params: Promise.resolve({ id: 'run_victim', fileId: 'file_victim' }) },
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('available after completion');
    noPii(body);
    expect(mockSigned).not.toHaveBeenCalled();
    expect(eqOn('WorkspaceRun', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('File', 'id')).toHaveLength(0);
  });
});

describe('PATCH /api/pipelines/[id] — Pipeline scoped', () => {
  it('404s a foreign pipeline and does not write', async () => {
    seed('Pipeline', { data: [] });

    const res = await patchPipeline(
      new NextRequest('http://localhost/api/pipelines/pipe_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params('pipe_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'Pipeline')).toHaveLength(0);
    expect(eqOn('Pipeline', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});
