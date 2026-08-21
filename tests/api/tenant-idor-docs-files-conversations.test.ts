/**
 * Behavioral IDOR locks for documents, files, and conversations.
 *
 * Cross-tenant ids must 404 (no existence oracle) and the response must
 * never include victim PII. No source-grep contracts — these execute the
 * route handlers against a mocked PostgREST client.
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
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/file'),
  deleteObject: vi.fn(async () => undefined),
  getObjectText: vi.fn(async () => '# doc'),
  uploadObject: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/chat/realtor-conversation-auth', () => ({
  getAuthorizedRealtorConversation: vi.fn(),
}));

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

import { GET as getDocument, DELETE as deleteDocument } from '@/app/api/documents/[id]/route';
import { GET as getFile, DELETE as deleteFile } from '@/app/api/files/[id]/route';
import { GET as getDealDoc, DELETE as deleteDealDoc } from '@/app/api/deals/[id]/documents/[docId]/route';
import { PATCH as patchConversation, DELETE as deleteConversation } from '@/app/api/ai/conversations/[id]/route';
import { GET as getMessages } from '@/app/api/ai/messages/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { auth } from '@clerk/nextjs/server';
import { getAuthorizedRealtorConversation } from '@/lib/chat/realtor-conversation-auth';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockAuth = vi.mocked(auth);
const mockGetAuthorized = vi.mocked(getAuthorizedRealtorConversation);

const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
  mockAuth.mockResolvedValue({ userId: 'u_caller' } as never);
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET/DELETE /api/documents/[id] — ContactDocument scoped, no PII leak', () => {
  it('404s a cross-tenant document id and does not leak victim metadata', async () => {
    seed('ContactDocument', { data: null });

    const res = await getDocument(
      new NextRequest('http://localhost/api/documents/doc_victim'),
      params('doc_victim'),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM');
    expect(body).not.toContain('secret.pdf');
    expect(eqOn('ContactDocument', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign document and does not delete', async () => {
    seed('ContactDocument', { data: null });

    const res = await deleteDocument(
      new NextRequest('http://localhost/api/documents/doc_victim', { method: 'DELETE' }),
      params('doc_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'ContactDocument')).toHaveLength(0);
    expect(eqOn('ContactDocument', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET/DELETE /api/files/[id] — File scoped, no PII leak', () => {
  it('404s a cross-tenant file id and does not leak the victim name', async () => {
    seed('File', { data: null });

    const res = await getFile(new NextRequest('http://localhost/api/files/file_victim'), params('file_victim'));
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM SECRET');
    expect(eqOn('File', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign file and does not delete', async () => {
    seed('File', { data: null });

    const res = await deleteFile(
      new NextRequest('http://localhost/api/files/file_victim', { method: 'DELETE' }),
      params('file_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'File')).toHaveLength(0);
    expect(eqOn('File', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('GET/DELETE /api/deals/[id]/documents/[docId] — DealDocument scoped, no PII leak', () => {
  it('404s a cross-tenant deal document and does not leak the victim label', async () => {
    seed('DealDocument', { data: null });

    const res = await getDealDoc(
      new NextRequest('http://localhost/api/deals/deal_victim/documents/doc_victim'),
      { params: Promise.resolve({ id: 'deal_victim', docId: 'doc_victim' }) },
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM');
    expect(body).not.toContain('offer-letter.pdf');
    expect(eqOn('DealDocument', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('DELETE 404s a foreign deal document and does not delete', async () => {
    seed('DealDocument', { data: null });

    const res = await deleteDealDoc(
      new NextRequest('http://localhost/api/deals/deal_victim/documents/doc_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'deal_victim', docId: 'doc_victim' }) },
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'DealDocument')).toHaveLength(0);
    expect(eqOn('DealDocument', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});

describe('PATCH/DELETE /api/ai/conversations/[id] — 404, no PII', () => {
  it('404s a cross-tenant conversation and does not write', async () => {
    mockGetAuthorized.mockResolvedValue(null);

    const res = await patchConversation(
      new NextRequest('http://localhost/api/ai/conversations/conv_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'stolen' }),
      }),
      params('conv_victim'),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('stolen');
    expect(body).not.toContain('VICTIM');
    expect(updateCalls.filter((u) => u.table === 'Conversation')).toHaveLength(0);
  });

  it('DELETE 404s a foreign conversation and does not delete', async () => {
    mockGetAuthorized.mockResolvedValue(null);

    const res = await deleteConversation(
      new NextRequest('http://localhost/api/ai/conversations/conv_victim', { method: 'DELETE' }),
      params('conv_victim'),
    );
    expect(res.status).toBe(404);
    expect(deleteCalls.filter((d) => d.table === 'Conversation')).toHaveLength(0);
  });
});

describe('GET /api/ai/messages — 404, no transcript leak', () => {
  it('404s a foreign conversationId and does not query Message', async () => {
    mockGetAuthorized.mockResolvedValue(null);

    const res = await getMessages(
      new NextRequest('http://localhost/api/ai/messages?conversationId=conv_victim'),
    );
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('secret transcript');
    expect(eqOn('Message', 'spaceId')).toHaveLength(0);
  });

  it('scopes Message reads to the authorized space when the conversation is owned', async () => {
    mockGetAuthorized.mockResolvedValue({
      conversation: { id: 'conv_mine', spaceId: 'space_caller', title: 'Mine' },
      space: { id: 'space_caller', ownerId: 'db_owner' },
      dbUser: { id: 'db_user' },
    } as never);
    seed('Message', { data: [] });

    const res = await getMessages(
      new NextRequest('http://localhost/api/ai/messages?conversationId=conv_mine'),
    );
    expect(res.status).toBe(200);
    expect(eqOn('Message', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });
});
