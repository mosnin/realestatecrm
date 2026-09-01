/**
 * Behavioral tests for POST/GET /api/documents — contact-document upload
 * and list. Deal-document magic-byte coverage already lives in
 * deals-documents-magic-bytes.test.ts; this file covers the contact path:
 *
 *   - missing/empty/oversized/unsupported/spoofed files 400 before auth
 *   - guest capability window (application-link + 5 min) — expired 404
 *   - requireContactAccess deny never uploads or inserts
 *   - uploadedBy is derived from the auth path (body cannot claim 'agent'
 *     on a guest upload, and a non-guest path always records 'agent')
 *   - insert is scoped to the resolved space; insert failure rolls back storage
 *   - GET lists only after access and scopes ContactDocument to caller space
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  requireContactAccess,
  checkRateLimit,
  uploadObject,
  deleteObject,
  queues,
  inserts,
  fromTables,
  eqs,
} = vi.hoisted(() => ({
  requireContactAccess: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  uploadObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  queues: {} as Record<string, Array<{ data?: unknown; error?: unknown }>>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  fromTables: [] as string[],
  eqs: [] as Array<{ table: string; column: string; value: unknown }>,
}));

function queueFor(table: string) {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/api-auth', () => ({ requireContactAccess }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/storage', () => ({
  uploadObject: (...a: unknown[]) => uploadObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  buildKey: (prefix: string, ...segments: string[]) => {
    const prefixes: Record<string, string> = { contactDocuments: 'contact-documents' };
    return [prefixes[prefix] ?? prefix, ...segments].join('/');
  },
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    fromTables.push(table);
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      eqs.push({ table, column, value });
      return chain;
    });
    chain.contains = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return chain;
    });
    const next = () => Promise.resolve(q.shift() ?? { data: null, error: null });
    chain.maybeSingle = vi.fn(() => next());
    chain.single = vi.fn(() => next());
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { GET, POST } from '@/app/api/documents/route';

const SPACE = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'u1' };
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html></html>');

function makePost(form: FormData): NextRequest {
  return new NextRequest('http://localhost/api/documents', { method: 'POST', body: form });
}

function formWith(opts: { contactId?: string; file?: File; uploadedBy?: string }): FormData {
  const fd = new FormData();
  if (opts.contactId) fd.append('contactId', opts.contactId);
  if (opts.file) fd.append('file', opts.file);
  if (opts.uploadedBy) fd.append('uploadedBy', opts.uploadedBy);
  return fd;
}

function pdfFile(name = 'offer.pdf'): File {
  return new File([PDF_BYTES], name, { type: 'application/pdf' });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  inserts.length = 0;
  fromTables.length = 0;
  eqs.length = 0;
  requireContactAccess.mockResolvedValue({ userId: 'clerk_1', space: SPACE });
  checkRateLimit.mockResolvedValue({ allowed: true });
  uploadObject.mockResolvedValue(undefined);
  deleteObject.mockResolvedValue(undefined);
});

describe('POST /api/documents — payload gates before auth', () => {
  it('400s when contactId or file is missing', async () => {
    const missingFile = await POST(makePost(formWith({ contactId: 'c1' })));
    expect(missingFile.status).toBe(400);
    const missingContact = await POST(makePost(formWith({ file: pdfFile() })));
    expect(missingContact.status).toBe(400);
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on an empty file', async () => {
    const res = await POST(
      makePost(formWith({ contactId: 'c1', file: new File([], 'empty.pdf', { type: 'application/pdf' }) })),
    );
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s when the file is over 10MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PDF_BYTES);
    const res = await POST(
      makePost(formWith({ contactId: 'c1', file: new File([big], 'big.pdf', { type: 'application/pdf' }) })),
    );
    expect(res.status).toBe(400);
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on an unsupported MIME before the magic-byte check', async () => {
    const res = await POST(
      makePost(
        formWith({
          contactId: 'c1',
          file: new File([HTML_BYTES], 'note.txt', { type: 'text/plain' }),
        }),
      ),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'File type not supported' });
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('rejects HTML spoofing application/pdf before auth or upload', async () => {
    const res = await POST(
      makePost(
        formWith({
          contactId: 'c1',
          file: new File([HTML_BYTES], 'evil.pdf', { type: 'application/pdf' }),
        }),
      ),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/does not match declared type/i),
    });
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
    expect(fromTables).not.toContain('Contact');
    expect(fromTables).not.toContain('ContactDocument');
  });
});

describe('POST /api/documents — guest capability window', () => {
  it('404s when the guest contact is missing or the 5-minute window expired', async () => {
    queueFor('Contact').push({ data: null, error: null });

    const res = await POST(
      makePost(formWith({ contactId: 'c_guest', file: pdfFile(), uploadedBy: 'guest' })),
    );
    expect(res.status).toBe(404);
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('stores a guest upload as uploadedBy=guest in the contact space, not the body space', async () => {
    queueFor('Contact').push({ data: { spaceId: 'space_intake' }, error: null });
    queueFor('ContactDocument').push({
      data: { id: 'doc_1', fileName: 'offer.pdf', fileType: 'application/pdf', fileSize: PDF_BYTES.length, createdAt: '2026-09-01' },
      error: null,
    });

    const res = await POST(
      makePost(formWith({ contactId: 'c_guest', file: pdfFile(), uploadedBy: 'guest' })),
    );
    expect(res.status).toBe(201);
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith('doc-upload:guest:c_guest', 20, 60);

    const uploaded = uploadObject.mock.calls[0]![0] as { key: string; isPublic: boolean };
    expect(uploaded.isPublic).toBe(false);
    expect(uploaded.key.startsWith('contact-documents/space_intake/c_guest/')).toBe(true);

    expect(inserts).toEqual([
      expect.objectContaining({
        table: 'ContactDocument',
        values: expect.objectContaining({
          contactId: 'c_guest',
          spaceId: 'space_intake',
          uploadedBy: 'guest',
          fileType: 'application/pdf',
        }),
      }),
    ]);
  });
});

describe('POST /api/documents — realtor path', () => {
  it('404s on requireContactAccess deny and never uploads', async () => {
    requireContactAccess.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));

    const res = await POST(makePost(formWith({ contactId: 'c_foreign', file: pdfFile() })));
    expect(res.status).toBe(404);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(fromTables).not.toContain('ContactDocument');
  });

  it('records uploadedBy=agent even when the body claims another role', async () => {
    queueFor('Contact').push({ data: { spaceId: 'space_1' }, error: null });
    queueFor('ContactDocument').push({
      data: { id: 'doc_2', fileName: 'offer.pdf', fileType: 'application/pdf', fileSize: PDF_BYTES.length, createdAt: '2026-09-01' },
      error: null,
    });

    const res = await POST(
      makePost(formWith({ contactId: 'c1', file: pdfFile(), uploadedBy: 'client' })),
    );
    expect(res.status).toBe(201);
    expect(requireContactAccess).toHaveBeenCalledWith('c1');
    expect(checkRateLimit).toHaveBeenCalledWith('doc-upload:clerk_1', 20, 60);
    expect(eqs).toContainEqual({ table: 'Contact', column: 'spaceId', value: 'space_1' });
    expect(eqs).toContainEqual({ table: 'Contact', column: 'id', value: 'c1' });
    expect(inserts[0]?.values).toMatchObject({
      spaceId: 'space_1',
      uploadedBy: 'agent',
    });
  });

  it('429s after access is proven and never uploads', async () => {
    queueFor('Contact').push({ data: { spaceId: 'space_1' }, error: null });
    checkRateLimit.mockResolvedValue({ allowed: false });

    const res = await POST(makePost(formWith({ contactId: 'c1', file: pdfFile() })));
    expect(res.status).toBe(429);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('rolls back the stored object when ContactDocument insert fails', async () => {
    queueFor('Contact').push({ data: { spaceId: 'space_1' }, error: null });
    queueFor('ContactDocument').push({ data: null, error: { message: 'insert failed' } });

    const res = await POST(makePost(formWith({ contactId: 'c1', file: pdfFile() })));
    expect(res.status).toBe(500);
    expect(uploadObject).toHaveBeenCalledTimes(1);
    const key = (uploadObject.mock.calls[0]![0] as { key: string }).key;
    expect(deleteObject).toHaveBeenCalledWith(key);
  });
});

describe('GET /api/documents', () => {
  it('400s when contactId is missing and never checks access', async () => {
    const res = await GET(new NextRequest('http://localhost/api/documents'));
    expect(res.status).toBe(400);
    expect(requireContactAccess).not.toHaveBeenCalled();
  });

  it('returns the access deny and never lists ContactDocument', async () => {
    requireContactAccess.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));

    const res = await GET(new NextRequest('http://localhost/api/documents?contactId=c_foreign'));
    expect(res.status).toBe(404);
    expect(fromTables).not.toContain('ContactDocument');
  });

  it('lists documents after access using the caller space', async () => {
    queueFor('ContactDocument').push({
      data: [{ id: 'doc_1', fileName: 'offer.pdf', fileType: 'application/pdf', fileSize: 9, uploadedBy: 'agent', createdAt: '2026-09-01' }],
      error: null,
    });

    const res = await GET(new NextRequest('http://localhost/api/documents?contactId=c1'));
    expect(res.status).toBe(200);
    expect(requireContactAccess).toHaveBeenCalledWith('c1');
    expect(eqs).toContainEqual({ table: 'ContactDocument', column: 'spaceId', value: 'space_1' });
    expect(eqs).toContainEqual({ table: 'ContactDocument', column: 'contactId', value: 'c1' });
    const body = await res.json();
    expect(body).toEqual([
      expect.objectContaining({ id: 'doc_1', fileName: 'offer.pdf' }),
    ]);
  });
});
