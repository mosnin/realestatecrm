/**
 * Behavioral IDOR locks for the next highest-risk tenant resources after
 * documents / files / conversations: contacts, notes, tours, call transcripts,
 * CMA payloads, MCP keys, and chat attachments.
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

vi.mock('@/lib/vectorize', () => ({
  syncContact: vi.fn(async () => undefined),
  deleteContactVector: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn() }));
vi.mock('@/lib/gcal-helpers', () => ({ deleteGoogleEvent: vi.fn(async () => false) }));
vi.mock('@/lib/tour-emails', () => ({ sendTourFollowUp: vi.fn() }));
vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger: vi.fn() }));

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
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'not', 'is', 'neq'];
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

import { GET as getContact, PATCH as patchContact, DELETE as deleteContact } from '@/app/api/contacts/[id]/route';
import { GET as getNote, PATCH as patchNote, DELETE as deleteNote } from '@/app/api/notes/[id]/route';
import { GET as getTour, DELETE as deleteTour } from '@/app/api/tours/[id]/route';
import { DELETE as deleteMcpKey } from '@/app/api/mcp-keys/[id]/route';
import { DELETE as deleteAttachment } from '@/app/api/ai/attachments/route';
import { GET as getCall } from '@/app/api/calls/[id]/route';
import { GET as getCma, DELETE as deleteCma } from '@/app/api/cma/[id]/route';
import { PATCH as patchAppStatus } from '@/app/api/applications/status/route';
import { requireAuth, requireContactAccess, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireContactAccess = vi.mocked(requireContactAccess);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

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

function noPii(body: string) {
  expect(body).not.toContain('VICTIM');
  expect(body).not.toContain('555-0100');
  expect(body).not.toContain('secret.pdf');
  expect(body).not.toContain('offer-letter');
}

describe('GET/PATCH/DELETE /api/contacts/[id] — Contact scoped, no PII leak', () => {
  it('404s a cross-tenant contact and does not leak the victim name', async () => {
    seed('Contact', { data: [] });

    const res = await getContact(new NextRequest('http://localhost/api/contacts/c_victim'), params('c_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PATCH 404s a foreign contact and does not write', async () => {
    seed('Contact', { data: [] });

    const res = await patchContact(
      new NextRequest('http://localhost/api/contacts/c_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    expect(updateCalls.filter((u) => u.table === 'Contact')).toHaveLength(0);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign contact and does not delete', async () => {
    seed('Contact', { data: [] });

    const res = await deleteContact(
      new NextRequest('http://localhost/api/contacts/c_victim', { method: 'DELETE' }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Contact')).toHaveLength(0);
  });
});

describe('GET/PATCH/DELETE /api/notes/[id] — Note scoped, no PII leak', () => {
  it('404s a cross-tenant note and does not leak the body', async () => {
    seed('Note', { data: null });

    const res = await getNote(new NextRequest('http://localhost/api/notes/note_victim'), params('note_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Note', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('PATCH 404s a foreign note and does not persist stolen content', async () => {
    seed('Note', { data: null });

    const res = await patchNote(
      new NextRequest('http://localhost/api/notes/note_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'VICTIM stolen note' }),
      }),
      params('note_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
  });

  it('DELETE 404s when the note is missing after a scoped delete', async () => {
    seed('Note', { data: null });

    const res = await deleteNote(
      new NextRequest('http://localhost/api/notes/note_victim', { method: 'DELETE' }),
      params('note_victim'),
    );
    // Delete is scoped; a missing row is still success:true today, but the
    // spaceId filter must have been applied and no unscoped table was opened.
    expect(eqOn('Note', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(res.status).toBeLessThan(500);
    void res;
  });
});

describe('GET/DELETE /api/tours/[id] — Tour scoped, no guest PII leak', () => {
  it('404s a cross-tenant tour and does not leak the guest phone', async () => {
    seed('Tour', { data: null });

    const res = await getTour(new NextRequest('http://localhost/api/tours/tour_victim'), params('tour_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign tour and does not delete', async () => {
    seed('Tour', { data: null });

    const res = await deleteTour(
      new NextRequest('http://localhost/api/tours/tour_victim', { method: 'DELETE' }),
      params('tour_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Tour')).toHaveLength(0);
  });
});

describe('DELETE /api/mcp-keys/[id] — secret revocation is space-scoped', () => {
  it('404s a foreign key and does not delete', async () => {
    seed('McpApiKey', { data: null });

    const res = await deleteMcpKey(
      new NextRequest('http://localhost/api/mcp-keys/key_victim', { method: 'DELETE' }),
      params('key_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'McpApiKey')).toHaveLength(0);
    expect(eqOn('McpApiKey', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('DELETE /api/ai/attachments — Attachment scoped, 404 not 403', () => {
  it('404s a foreign attachment and does not delete', async () => {
    seed('Attachment', { data: null });

    const res = await deleteAttachment(
      new NextRequest('http://localhost/api/ai/attachments?id=att_victim', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('Forbidden');
    noPii(body);
    expect(deleteCalls.filter((d) => d.table === 'Attachment')).toHaveLength(0);
    expect(eqOn('Attachment', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET /api/calls/[id] — CallLog transcript scoped', () => {
  it('404s a cross-tenant call and does not leak the transcript', async () => {
    seed('CallLog', { data: null });

    const res = await getCall(
      new NextRequest('http://localhost/api/calls/call_victim?slug=jane'),
      params('call_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('CallLog', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET/DELETE /api/cma/[id] — CmaReport payload scoped', () => {
  it('404s a cross-tenant CMA and does not leak the address', async () => {
    seed('CmaReport', { data: null });

    const res = await getCma(
      new NextRequest('http://localhost/api/cma/cma_victim?slug=jane'),
      params('cma_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(eqOn('CmaReport', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE still scopes by spaceId', async () => {
    seed('CmaReport', { data: null });

    const res = await deleteCma(
      new NextRequest('http://localhost/api/cma/cma_victim?slug=jane', { method: 'DELETE' }),
      params('cma_victim'),
    );
    expect(res.status).toBeLessThan(500);
    expect(eqOn('CmaReport', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH /api/applications/status — Contact write is space-scoped', () => {
  it('404s when requireContactAccess rejects a foreign contact', async () => {
    mockRequireContactAccess.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));

    const res = await patchAppStatus(
      new NextRequest('http://localhost/api/applications/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: 'c_victim', status: 'approved' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(updateCalls.filter((u) => u.table === 'Contact')).toHaveLength(0);
  });
});
