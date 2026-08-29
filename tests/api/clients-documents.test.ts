/**
 * Client-portal documents — ownership, signed-URL scoping, magic-byte sniff.
 *
 * A verified client can list/download/upload only for a Contact they own.
 * A foreign contact or document id must 404 (not 403) and must not mint a
 * signed URL or touch storage. Upload content is sniffed the same way as
 * the realtor deal-document route.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getClientUser,
  clientOwnsContact,
  checkRateLimit,
  uploadObject,
  deleteObject,
  getSignedDownloadUrl,
} = vi.hoisted(() => ({
  getClientUser: vi.fn(),
  clientOwnsContact: vi.fn(),
  checkRateLimit: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];
const inserts: { table: string; values: Record<string, unknown> }[] = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const next = (): Promise<Terminal> => Promise.resolve(queueFor(table).shift() ?? { data: null });
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn((values: Record<string, unknown>) => {
    inserts.push({ table, values });
    return chain;
  });
  chain.update = vi.fn(() => chain);
  for (const method of ['eq', 'neq', 'ilike'] as const) {
    chain[method] = vi.fn((column: string, value: unknown) => {
      filterCalls.push({ table, method, column, value });
      return chain;
    });
  }
  chain.order = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => next());
  chain.single = vi.fn(() => next());
  (chain as { then: unknown }).then = (
    resolve: (v: Terminal) => unknown,
    reject?: (e: unknown) => unknown,
  ) => next().then(resolve, reject);
  return chain;
}

vi.mock('@/lib/client-auth', () => ({ getClientUser }));
vi.mock('@/lib/client-portal-data', () => ({ clientOwnsContact }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/storage', () => ({
  uploadObject: (...a: unknown[]) => uploadObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  getSignedDownloadUrl: (...a: unknown[]) => getSignedDownloadUrl(...a),
  buildKey: (...parts: string[]) => parts.join('/'),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { GET, POST } from '@/app/api/clients/documents/route';

const VERIFIED = {
  id: 'cu_1',
  email: 'owner@example.com',
  name: 'Pat',
  emailVerifiedAt: '2026-01-01T00:00:00Z',
};

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html></html>');

function getReq(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return new NextRequest(`http://localhost/api/clients/documents?${params.toString()}`);
}

function postReq(form: FormData) {
  return new NextRequest('http://localhost/api/clients/documents', {
    method: 'POST',
    body: form,
  });
}

function pdfForm(contactId: string, bytes: Uint8Array, name = 'contract.pdf', type = 'application/pdf') {
  const fd = new FormData();
  fd.append('contactId', contactId);
  fd.append('file', new File([bytes], name, { type }));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  filterCalls.length = 0;
  inserts.length = 0;
  getClientUser.mockResolvedValue(VERIFIED);
  clientOwnsContact.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ allowed: true });
  uploadObject.mockResolvedValue(undefined);
  deleteObject.mockResolvedValue(undefined);
  getSignedDownloadUrl.mockResolvedValue('https://signed.example/doc');
});

describe('GET /api/clients/documents', () => {
  it('401s when the portal session is missing or unverified', async () => {
    getClientUser.mockResolvedValue(null);
    expect((await GET(getReq({ contactId: 'c1' }))).status).toBe(401);

    getClientUser.mockResolvedValue({ ...VERIFIED, emailVerifiedAt: null });
    expect((await GET(getReq({ contactId: 'c1', id: 'd1' }))).status).toBe(401);
    expect(clientOwnsContact).not.toHaveBeenCalled();
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('404s a foreign contact and does not mint a signed URL', async () => {
    clientOwnsContact.mockResolvedValue(false);
    const res = await GET(getReq({ contactId: 'foreign', id: 'd1' }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(clientOwnsContact).toHaveBeenCalledWith('owner@example.com', 'foreign');
    expect(filterCalls.some((c) => c.table === 'ClientDocument')).toBe(false);
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('404s a document that does not belong to the owned contact', async () => {
    queueFor('ClientDocument').push({ data: null });
    const res = await GET(getReq({ contactId: 'c1', id: 'd-foreign' }));
    expect(res.status).toBe(404);
    expect(getSignedDownloadUrl).not.toHaveBeenCalled();
    expect(filterCalls).toContainEqual({
      table: 'ClientDocument',
      method: 'eq',
      column: 'id',
      value: 'd-foreign',
    });
    expect(filterCalls).toContainEqual({
      table: 'ClientDocument',
      method: 'eq',
      column: 'contactId',
      value: 'c1',
    });
  });

  it('mints a signed URL only after both contact ownership and document match', async () => {
    queueFor('ClientDocument').push({ data: { fileKey: 'contactDocuments/s1/c1/doc.pdf' } });
    const res = await GET(getReq({ contactId: 'c1', id: 'd1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://signed.example/doc' });
    expect(getSignedDownloadUrl).toHaveBeenCalledWith('contactDocuments/s1/c1/doc.pdf');
  });
});

describe('POST /api/clients/documents', () => {
  it('does not upload when the contact is not owned', async () => {
    clientOwnsContact.mockResolvedValue(false);
    const res = await POST(postReq(pdfForm('c-other', PDF_BYTES)));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(uploadObject).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('rejects a renamed HTML file spoofing application/pdf before upload', async () => {
    const res = await POST(postReq(pdfForm('c1', HTML_BYTES, 'evil.pdf')));
    expect(res.status).toBe(400);
    expect(String((await res.json()).error)).toMatch(/does not match/i);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('uploads a real PDF and inserts uploadedBy=client scoped to the contact space', async () => {
    queueFor('Contact').push({ data: { spaceId: 's1' } });
    queueFor('ClientDocument').push({
      data: {
        id: 'd1',
        fileName: 'contract.pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF_BYTES.byteLength,
        uploadedBy: 'client',
        createdAt: '2026-01-01T00:00:00Z',
      },
      error: null,
    });

    const res = await POST(postReq(pdfForm('c1', PDF_BYTES)));
    expect(res.status).toBe(201);
    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(uploadObject.mock.calls[0]?.[0]).toMatchObject({
      contentType: 'application/pdf',
      isPublic: false,
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe('ClientDocument');
    expect(inserts[0]?.values).toMatchObject({
      contactId: 'c1',
      spaceId: 's1',
      uploadedBy: 'client',
      contentType: 'application/pdf',
    });
  });
});
