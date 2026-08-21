/**
 * Behavioral IDOR locks for the next highest-risk tenant resources after
 * contacts / notes / tours / docs: deals, properties, custom agents, drafts,
 * memories, e-sign, packets, waitlist, and agent contact intelligence.
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
  deleteObject: vi.fn(async () => undefined),
  deleteObjectsBestEffort: vi.fn(async () => ({ ok: 0, failed: [] })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/vectorize', () => ({
  syncDeal: vi.fn(async () => undefined),
  deleteDealVector: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn() }));
vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger: vi.fn() }));
vi.mock('@/lib/esign', () => ({
  dealHasOpenSignatureRequests: vi.fn(async () => false),
  refreshEnvelopeStatus: vi.fn(async () => ({ ok: true, signatureRequest: { id: 'sig' } })),
}));
vi.mock('@/lib/reputation/review-engine', () => ({ fireReviewAsk: vi.fn() }));
vi.mock('@/lib/delivery', () => ({ sendDraft: vi.fn() }));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: vi.fn() }));
vi.mock('@/lib/tour-waitlist-email', () => ({ sendEmail: vi.fn() }));

type TableResult = { data?: unknown; error?: unknown };
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
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET as getDeal, PATCH as patchDeal, DELETE as deleteDeal } from '@/app/api/deals/[id]/route';
import { GET as getProperty, PATCH as patchProperty, DELETE as deleteProperty } from '@/app/api/properties/[id]/route';
import { GET as getCustomAgent, PUT as putCustomAgent, DELETE as deleteCustomAgent } from '@/app/api/custom-agents/[id]/route';
import { PATCH as patchDraft } from '@/app/api/agent/drafts/[id]/route';
import { DELETE as deleteMemory } from '@/app/api/agent/memory/[id]/route';
import { GET as getEsign } from '@/app/api/esign/[id]/route';
import { PATCH as patchPacket, DELETE as deletePacket } from '@/app/api/properties/[id]/packets/[packetId]/route';
import { POST as notifyWaitlist } from '@/app/api/tours/waitlist/notify/route';
import { GET as getAgentContact } from '@/app/api/agent/contact/[id]/route';
import { GET as getAppMessage } from '@/app/api/applications/[id]/message/route';
import { DELETE as deleteOverride } from '@/app/api/tours/overrides/[id]/route';
import { requireAuth, requireContactAccess, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { refreshEnvelopeStatus } from '@/lib/esign';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireContactAccess = vi.mocked(requireContactAccess);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockRefreshEnvelope = vi.mocked(refreshEnvelopeStatus);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  mockRequireSpaceOwner.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function packetParams(id: string, packetId: string) {
  return { params: Promise.resolve({ id, packetId }) };
}

function noPii(body: string) {
  expect(body).not.toContain('VICTIM');
  expect(body).not.toContain('555-0100');
  expect(body).not.toContain('$500,000');
  expect(body).not.toContain('secret.pdf');
  expect(body).not.toContain('signer@victim.com');
  expect(body).not.toContain('123 Victim Lane');
}

describe('GET/PATCH/DELETE /api/deals/[id] — Deal scoped, no PII leak', () => {
  it('404s a cross-tenant deal and does not leak the title', async () => {
    seed('Deal', { data: [] });

    const res = await getDeal(new NextRequest('http://localhost/api/deals/deal_victim'), params('deal_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PATCH 404s a foreign deal and does not write', async () => {
    seed('Deal', { data: [] });

    const res = await patchDeal(
      new NextRequest('http://localhost/api/deals/deal_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'stolen' }),
      }),
      params('deal_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'Deal')).toHaveLength(0);
    expect(eqOn('Deal', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign deal and does not delete', async () => {
    seed('Deal', { data: [] });

    const res = await deleteDeal(
      new NextRequest('http://localhost/api/deals/deal_victim', { method: 'DELETE' }),
      params('deal_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Deal')).toHaveLength(0);
  });
});

describe('GET/PATCH/DELETE /api/properties/[id] — Property scoped, no address leak', () => {
  it('404s a cross-tenant property and does not leak the address', async () => {
    seed('Property', { data: null });

    const res = await getProperty(
      new NextRequest('http://localhost/api/properties/prop_victim'),
      params('prop_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Property', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('Tour', 'spaceId')).toHaveLength(0);
  });

  it('PATCH 404s a foreign property and does not write', async () => {
    seed('Property', { data: null });

    const res = await patchProperty(
      new NextRequest('http://localhost/api/properties/prop_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: '123 Victim Lane' }),
      }),
      params('prop_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'Property')).toHaveLength(0);
  });

  it('DELETE 404s a foreign property and does not delete', async () => {
    seed('Property', { data: null });

    const res = await deleteProperty(
      new NextRequest('http://localhost/api/properties/prop_victim', { method: 'DELETE' }),
      params('prop_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Property')).toHaveLength(0);
  });
});

describe('GET/PUT/DELETE /api/custom-agents/[id] — 404 not 403, no prompt leak', () => {
  it('404s a cross-tenant agent and does not leak the system prompt', async () => {
    seed('CustomAgent', { data: null });

    const res = await getCustomAgent(
      new NextRequest('http://localhost/api/custom-agents/agent_victim'),
      params('agent_victim'),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('Forbidden');
    noPii(body);
    expect(eqOn('CustomAgent', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PUT 404s a foreign agent and does not write', async () => {
    seed('CustomAgent', { data: null });

    const res = await putCustomAgent(
      new NextRequest('http://localhost/api/custom-agents/agent_victim', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params('agent_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'CustomAgent')).toHaveLength(0);
  });

  it('DELETE 404s a foreign agent and does not soft-delete', async () => {
    seed('CustomAgent', { data: null });

    const res = await deleteCustomAgent(
      new NextRequest('http://localhost/api/custom-agents/agent_victim', { method: 'DELETE' }),
      params('agent_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'CustomAgent')).toHaveLength(0);
  });
});

describe('PATCH /api/agent/drafts/[id] — AgentDraft scoped', () => {
  it('404s a foreign draft and does not write', async () => {
    seed('AgentDraft', { data: null, error: { message: 'not found' } });

    const res = await patchDraft(
      new NextRequest('http://localhost/api/agent/drafts/draft_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }),
      params('draft_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'AgentDraft')).toHaveLength(0);
    expect(eqOn('AgentDraft', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('DELETE /api/agent/memory/[id] — AgentMemory scoped', () => {
  it('404s a foreign memory and does not delete', async () => {
    seed('AgentMemory', { data: null });

    const res = await deleteMemory(
      new NextRequest('http://localhost/api/agent/memory/mem_victim', { method: 'DELETE' }),
      params('mem_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'AgentMemory')).toHaveLength(0);
    expect(eqOn('AgentMemory', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/esign/[id] — SignatureRequest scoped before DocuSign', () => {
  it('404s a foreign envelope and does not refresh DocuSign', async () => {
    seed('SignatureRequest', { data: null });

    const res = await getEsign(
      new NextRequest('http://localhost/api/esign/sig_victim?slug=jane'),
      params('sig_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(mockRefreshEnvelope).not.toHaveBeenCalled();
    expect(eqOn('SignatureRequest', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/properties/[id]/packets/[packetId] — PropertyPacket scoped', () => {
  it('PATCH 404s a foreign packet and does not write', async () => {
    seed('PropertyPacket', { data: null });

    const res = await patchPacket(
      new NextRequest('http://localhost/api/properties/prop_victim/packets/pkt_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoked: true }),
      }),
      packetParams('prop_victim', 'pkt_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'PropertyPacket')).toHaveLength(0);
    expect(eqOn('PropertyPacket', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign packet and does not delete', async () => {
    seed('PropertyPacket', { data: null });

    const res = await deletePacket(
      new NextRequest('http://localhost/api/properties/prop_victim/packets/pkt_victim', { method: 'DELETE' }),
      packetParams('prop_victim', 'pkt_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'PropertyPacket')).toHaveLength(0);
  });
});

describe('POST /api/tours/waitlist/notify — TourWaitlist scoped', () => {
  it('404s a foreign waitlist id and does not write', async () => {
    seed('TourWaitlist', { data: null });

    const res = await notifyWaitlist(
      new NextRequest('http://localhost/api/tours/waitlist/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'jane', waitlistId: 'wl_victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'TourWaitlist')).toHaveLength(0);
    expect(eqOn('TourWaitlist', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/agent/contact/[id] — Contact scoped before child PII', () => {
  it('404s a foreign contact and does not query memories or drafts', async () => {
    seed('Contact', { data: null });

    const res = await getAgentContact(
      new NextRequest('http://localhost/api/agent/contact/c_victim'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('AgentMemory', 'spaceId')).toHaveLength(0);
    expect(eqOn('AgentDraft', 'spaceId')).toHaveLength(0);
  });
});

describe('GET /api/applications/[id]/message — requireContactAccess 404s first', () => {
  it('404s a foreign contact and does not leak applicant messages', async () => {
    mockRequireContactAccess.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));

    const res = await getAppMessage(
      new NextRequest('http://localhost/api/applications/c_victim/message'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('ApplicationMessage', 'spaceId')).toHaveLength(0);
  });
});

describe('DELETE /api/tours/overrides/[id] — 404 not 403', () => {
  it('404s a foreign override and does not delete', async () => {
    seed('TourAvailabilityOverride', { data: null });

    const res = await deleteOverride(
      new NextRequest('http://localhost/api/tours/overrides/ovr_victim', { method: 'DELETE' }),
      params('ovr_victim'),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('Forbidden');
    expect(deleteCalls.filter((d) => d.table === 'TourAvailabilityOverride')).toHaveLength(0);
    expect(eqOn('TourAvailabilityOverride', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});
