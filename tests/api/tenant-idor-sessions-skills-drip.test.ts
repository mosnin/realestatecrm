/**
 * Behavioral IDOR locks for the next highest-risk tenant resources after
 * templates / workflows / cards: work sessions, skills, plugins, drip,
 * commission splits, browser links, agent tasks, deal-contact roles,
 * swarm runs, and saved views.
 *
 * Cross-tenant ids must 404 (no existence oracle) and must not leak victim PII.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
}));

vi.mock('@/lib/permissions', () => ({
  getCurrentDbUser: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));

vi.mock('@/lib/work-sessions/kick', () => ({
  kickPlan: vi.fn(),
  kickExecute: vi.fn(),
}));

vi.mock('@/lib/browser-control/session', () => ({
  endSessionsForLink: vi.fn(),
}));

vi.mock('@/lib/agent/task-state-machine', () => ({
  transitionTask: vi.fn(),
}));

vi.mock('@/lib/net/ssrf-guard', () => ({
  assertPublicHttpTarget: vi.fn(async () => ({ ok: true })),
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

import { GET as getWorkSession, PATCH as patchWorkSession } from '@/app/api/work-sessions/[id]/route';
import { PATCH as patchSkill, DELETE as deleteSkill } from '@/app/api/skills/[id]/route';
import { PATCH as patchPlugin, DELETE as deletePlugin } from '@/app/api/plugins/[id]/route';
import { DELETE as stopEnrollment } from '@/app/api/drip/enroll/[id]/route';
import { GET as getSequence, PATCH as patchSequence, DELETE as deleteSequence } from '@/app/api/drip/sequences/[id]/route';
import { PATCH as patchSplit, DELETE as deleteSplit } from '@/app/api/deals/[id]/commission-splits/[splitId]/route';
import { DELETE as revokeLink } from '@/app/api/browser-control/link/[id]/route';
import { GET as getAgentTask, DELETE as cancelAgentTask } from '@/app/api/agent/tasks/[taskId]/route';
import { PATCH as patchDealContact } from '@/app/api/deals/[id]/contacts/[contactId]/route';
import { GET as getSwarm } from '@/app/api/swarm/[runId]/route';
import { DELETE as deleteSavedView } from '@/app/api/saved-views/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { kickPlan, kickExecute } from '@/lib/work-sessions/kick';
import { endSessionsForLink } from '@/lib/browser-control/session';
import { transitionTask } from '@/lib/agent/task-state-machine';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockGetCurrentDbUser = vi.mocked(getCurrentDbUser);
const mockKickPlan = vi.mocked(kickPlan);
const mockKickExecute = vi.mocked(kickExecute);
const mockEndSessions = vi.mocked(endSessionsForLink);
const mockTransitionTask = vi.mocked(transitionTask);

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
  mockGetCurrentDbUser.mockResolvedValue({ id: 'user_caller', clerkId: 'u_caller' });
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

describe('GET/PATCH /api/work-sessions/[id] — WorkSession scoped', () => {
  it('GET 404s a foreign session and does not leak the goal', async () => {
    seed('WorkSession', { data: null });

    const res = await getWorkSession(
      new NextRequest('http://localhost/api/work-sessions/ws_victim?slug=jane'),
      params('ws_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('WorkSession', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(mockKickExecute).not.toHaveBeenCalled();
    expect(mockKickPlan).not.toHaveBeenCalled();
  });

  it('PATCH 404s a foreign session before any transition', async () => {
    seed('WorkSession', { data: null });

    const res = await patchWorkSession(
      new NextRequest('http://localhost/api/work-sessions/ws_victim?slug=jane', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      }),
      params('ws_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'WorkSession')).toHaveLength(0);
    expect(mockKickExecute).not.toHaveBeenCalled();
    expect(eqOn('WorkSession', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/skills/[id] — UserSkill scoped', () => {
  it('PATCH 404s a foreign skill and scopes the no-op write', async () => {
    seed('UserSkill', { data: null });

    const res = await patchSkill(
      new NextRequest('http://localhost/api/skills/skill_victim?slug=jane', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'stolen', enabled: false }),
      }),
      params('skill_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('UserSkill', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign skill after a space-scoped delete', async () => {
    seed('UserSkill', { data: [] });

    const res = await deleteSkill(
      new NextRequest('http://localhost/api/skills/skill_victim?slug=jane', { method: 'DELETE' }),
      params('skill_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'UserSkill')).toHaveLength(1);
    expect(eqOn('UserSkill', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/plugins/[id] — CustomPlugin scoped', () => {
  it('PATCH 404s a foreign plugin and does not leak its URL', async () => {
    seed('CustomPlugin', { data: null });

    const res = await patchPlugin(
      new NextRequest('http://localhost/api/plugins/plug_victim?slug=jane', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      params('plug_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('CustomPlugin', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign plugin after a space-scoped delete', async () => {
    seed('CustomPlugin', { data: [] });

    const res = await deletePlugin(
      new NextRequest('http://localhost/api/plugins/plug_victim?slug=jane', { method: 'DELETE' }),
      params('plug_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'CustomPlugin')).toHaveLength(1);
    expect(eqOn('CustomPlugin', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('DELETE /api/drip/enroll/[id] — DripEnrollment scoped', () => {
  it('404s a foreign enrollment and does not stop it', async () => {
    seed('DripEnrollment', { data: null });

    const res = await stopEnrollment(
      new NextRequest('http://localhost/api/drip/enroll/enr_victim', { method: 'DELETE' }),
      params('enr_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'DripEnrollment')).toHaveLength(0);
    expect(eqOn('DripEnrollment', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET/PATCH/DELETE /api/drip/sequences/[id] — DripSequence scoped', () => {
  it('GET 404s a foreign sequence and does not leak steps', async () => {
    seed('DripSequence', { data: null });

    const res = await getSequence(
      new NextRequest('http://localhost/api/drip/sequences/seq_victim'),
      params('seq_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('DripSequence', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PATCH 404s a foreign sequence after a space-scoped write', async () => {
    seed('DripSequence', { data: null });

    const res = await patchSequence(
      new NextRequest('http://localhost/api/drip/sequences/seq_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen', active: false }),
      }),
      params('seq_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('DripSequence', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign sequence before the live-enrollment check', async () => {
    seed('DripSequence', { data: null });

    const res = await deleteSequence(
      new NextRequest('http://localhost/api/drip/sequences/seq_victim', { method: 'DELETE' }),
      params('seq_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'DripSequence')).toHaveLength(0);
    expect(eqOn('DripEnrollment', 'sequenceId')).toHaveLength(0);
    expect(eqOn('DripSequence', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/deals/[id]/commission-splits/[splitId] — CommissionSplit scoped', () => {
  it('PATCH 404s a foreign split and does not write', async () => {
    seed('CommissionSplit', { data: null });

    const res = await patchSplit(
      new NextRequest('http://localhost/api/deals/deal_victim/commission-splits/split_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'stolen $500,000' }),
      }),
      { params: Promise.resolve({ id: 'deal_victim', splitId: 'split_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'CommissionSplit')).toHaveLength(0);
    expect(eqOn('CommissionSplit', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign split and does not delete', async () => {
    seed('CommissionSplit', { data: null });

    const res = await deleteSplit(
      new NextRequest('http://localhost/api/deals/deal_victim/commission-splits/split_victim', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'deal_victim', splitId: 'split_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'CommissionSplit')).toHaveLength(0);
  });
});

describe('DELETE /api/browser-control/link/[id] — BrowserLink scoped', () => {
  it('404s a foreign link and does not revoke it', async () => {
    seed('BrowserLink', { data: null });

    const res = await revokeLink(
      new NextRequest('http://localhost/api/browser-control/link/link_victim', { method: 'DELETE' }),
      params('link_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'BrowserLink')).toHaveLength(0);
    expect(mockEndSessions).not.toHaveBeenCalled();
    expect(eqOn('BrowserLink', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET/DELETE /api/agent/tasks/[taskId] — AgentTask scoped', () => {
  it('GET 404s a foreign task and does not list execution steps', async () => {
    seed('AgentTask', { data: null });

    const res = await getAgentTask(
      new NextRequest('http://localhost/api/agent/tasks/task_victim'),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('AgentTask', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('ExecutionStep', 'taskId')).toHaveLength(0);
  });

  it('DELETE 404s a foreign task and does not cancel it', async () => {
    seed('AgentTask', { data: null });

    const res = await cancelAgentTask(
      new NextRequest('http://localhost/api/agent/tasks/task_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(mockTransitionTask).not.toHaveBeenCalled();
    expect(eqOn('AgentTask', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH /api/deals/[id]/contacts/[contactId] — Deal + Contact scoped before join write', () => {
  it('404s a foreign deal and does not write DealContact', async () => {
    seed('Deal', { data: null });

    const res = await patchDealContact(
      new NextRequest('http://localhost/api/deals/deal_victim/contacts/c_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'buyer' }),
      }),
      { params: Promise.resolve({ id: 'deal_victim', contactId: 'c_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'DealContact')).toHaveLength(0);
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('Contact', 'id')).toHaveLength(0);
  });

  it('404s a foreign contact on an own deal and does not write DealContact', async () => {
    seed('Deal', { data: { id: 'deal_own' } });
    seed('Contact', { data: null });

    const res = await patchDealContact(
      new NextRequest('http://localhost/api/deals/deal_own/contacts/c_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'buyer' }),
      }),
      { params: Promise.resolve({ id: 'deal_own', contactId: 'c_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'DealContact')).toHaveLength(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/swarm/[runId] — SwarmRun scoped', () => {
  it('404s a foreign run and does not list members', async () => {
    seed('SwarmRun', { data: null });

    const res = await getSwarm(
      new NextRequest('http://localhost/api/swarm/swarm_victim'),
      { params: Promise.resolve({ runId: 'swarm_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('SwarmRun', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('SwarmMember', 'swarmRunId')).toHaveLength(0);
  });
});

describe('DELETE /api/saved-views — SavedView scoped', () => {
  it('404s a foreign view after a space-scoped delete', async () => {
    seed('SavedView', { data: [] });

    const res = await deleteSavedView(
      new NextRequest('http://localhost/api/saved-views?slug=jane&id=view_victim', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(deleteCalls.filter((d) => d.table === 'SavedView')).toHaveLength(1);
    expect(eqOn('SavedView', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});
