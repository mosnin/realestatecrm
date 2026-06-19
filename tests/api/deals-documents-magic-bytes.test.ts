/**
 * Route-level test for POST /api/deals/[id]/documents — magic-byte content
 * sniffing on upload.
 *
 * Security regression guard: before this, the route trusted the client-supplied
 * Content-Type, so a renamed evil.html → evil.pdf (Content-Type:
 * application/pdf) was stored as a "document". The route now reads the first 16
 * bytes and runs the shared validateUpload() magic-byte check; bytes that don't
 * match the declared type are rejected with 400 BEFORE any upload happens.
 *
 * validateUpload is NOT mocked — the real magic-byte logic is what's under test.
 * Storage/supabase/auth are mocked so the only variable is the byte check.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'space_1', name: 'Acme' })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Storage: record whether an upload was attempted so we can assert the sniff
// rejects BEFORE touching storage.
const uploadObject = vi.fn((..._a: unknown[]) => Promise.resolve(undefined));
const deleteObject = vi.fn((..._a: unknown[]) => Promise.resolve(undefined));
vi.mock('@/lib/storage', () => ({
  uploadObject: (...a: unknown[]) => uploadObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  buildKey: (...parts: string[]) => parts.join('/'),
}));

// Supabase: Deal lookup (resolveDealAndSpace) returns a deal in this space;
// DealDocument insert echoes a row back.
vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isInsert = false;
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.insert = vi.fn(() => {
      isInsert = true;
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      if (table === 'Deal') return Promise.resolve({ data: { id: 'deal_1' }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() => {
      if (table === 'DealDocument' && isInsert) {
        return Promise.resolve({ data: { id: 'doc_1' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { POST } from '@/app/api/deals/[id]/documents/route';
import { requireAuth } from '@/lib/api-auth';

const mockRequireAuth = vi.mocked(requireAuth);

function makeReq(form: FormData): NextRequest {
  return new NextRequest('http://localhost/api/deals/deal_1/documents', {
    method: 'POST',
    body: form,
  });
}

const params = Promise.resolve({ id: 'deal_1' });

// %PDF-1.4 header — the real magic bytes for application/pdf.
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
// "<!DOCTYPE html>" — HTML masquerading as a PDF.
const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html></html>');

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' } as never);
});

describe('POST /api/deals/[id]/documents — magic-byte sniff', () => {
  it('rejects a renamed .html spoofing application/pdf with 400, before any upload', async () => {
    const file = new File([HTML_BYTES], 'evil.pdf', { type: 'application/pdf' });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'other');

    const res = await POST(makeReq(fd), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toMatch(/does not match/i);
    // The reject must happen before storage is touched.
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('accepts a real PDF (correct magic bytes) and proceeds to upload', async () => {
    const file = new File([PDF_BYTES], 'contract.pdf', { type: 'application/pdf' });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'other');

    const res = await POST(makeReq(fd), { params });
    expect(res.status).toBe(201);
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it('rejects a PNG whose bytes are actually HTML (declared image/png) with 400', async () => {
    const file = new File([HTML_BYTES], 'pic.png', { type: 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'other');

    const res = await POST(makeReq(fd), { params });
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });
});
