/**
 * Behavioral tests for GET /api/packet/[token]/documents/[docId].
 *
 * Public, unauthenticated download gated only by the packet capability token.
 * Wrong token, revoked/expired link, or a doc id not listed on the packet
 * must never mint a signed URL or read DealDocument outside the packet space.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { h } = vi.hoisted(() => ({
  h: {
    packet: null as Record<string, unknown> | null,
    doc: null as Record<string, unknown> | null,
    fromCalls: [] as string[],
    eqCalls: [] as Array<{ table: string; column: string; value: unknown }>,
    signedUrl: vi.fn(async (_path: string, _ttl?: number) => 'https://cdn.example/signed'),
  },
}));

vi.mock('@/lib/supabase-guard', () => ({
  unscoped: (query: unknown) => query,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: (...args: unknown[]) => h.signedUrl(...(args as [string, number?])),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      h.fromCalls.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: (column: string, value: unknown) => {
          h.eqCalls.push({ table, column, value });
          return chain;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === 'PropertyPacket' ? h.packet : table === 'DealDocument' ? h.doc : null,
            error: null,
          }),
      });
      return chain;
    },
  },
}));

import { GET } from '@/app/api/packet/[token]/documents/[docId]/route';

function makeReq(token: string, docId: string): NextRequest {
  return new NextRequest(`http://localhost/api/packet/${token}/documents/${docId}`);
}

async function call(token: string, docId: string) {
  return GET(makeReq(token, docId), { params: Promise.resolve({ token, docId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.packet = null;
  h.doc = null;
  h.fromCalls.length = 0;
  h.eqCalls.length = 0;
  h.signedUrl.mockResolvedValue('https://cdn.example/signed');
});

describe('GET /api/packet/[token]/documents/[docId]', () => {
  it('returns 404 for an unknown token and does not mint a URL', async () => {
    const res = await call('tok_missing', 'doc_1');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(h.fromCalls).toEqual(['PropertyPacket']);
    expect(h.eqCalls).toEqual([{ table: 'PropertyPacket', column: 'token', value: 'tok_missing' }]);
    expect(h.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 410 for a revoked packet and does not read DealDocument', async () => {
    h.packet = {
      includeDocumentIds: ['doc_1'],
      spaceId: 'space_victim',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: '2026-01-01T00:00:00.000Z',
    };
    const res = await call('tok_revoked', 'doc_1');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'Link revoked' });
    expect(h.fromCalls).not.toContain('DealDocument');
    expect(h.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 410 for an expired packet and does not mint a URL', async () => {
    h.packet = {
      includeDocumentIds: ['doc_1'],
      spaceId: 'space_1',
      expiresAt: '2020-01-01T00:00:00.000Z',
      revokedAt: null,
    };
    const res = await call('tok_expired', 'doc_1');
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'Link expired' });
    expect(h.fromCalls).not.toContain('DealDocument');
    expect(h.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 403 when the doc id is not listed on the packet', async () => {
    h.packet = {
      includeDocumentIds: ['doc_allowed'],
      spaceId: 'space_1',
      expiresAt: null,
      revokedAt: null,
    };
    const res = await call('tok_ok', 'doc_other');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Document not in packet' });
    expect(h.fromCalls).not.toContain('DealDocument');
    expect(h.signedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 when the listed doc is missing from the packet space', async () => {
    h.packet = {
      includeDocumentIds: ['doc_1'],
      spaceId: 'space_1',
      expiresAt: null,
      revokedAt: null,
    };
    h.doc = null;
    const res = await call('tok_ok', 'doc_1');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Document not found' });
    expect(h.eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'DealDocument', column: 'spaceId', value: 'space_1' },
        { table: 'DealDocument', column: 'id', value: 'doc_1' },
      ]),
    );
    expect(h.signedUrl).not.toHaveBeenCalled();
  });

  it('mints a 5-minute signed URL for a listed doc in the packet space', async () => {
    h.packet = {
      includeDocumentIds: ['doc_1'],
      spaceId: 'space_1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
    };
    h.doc = { storagePath: 'deal-docs/space_1/contract.pdf', spaceId: 'space_1' };

    const res = await call('tok_ok', 'doc_1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://cdn.example/signed' });
    expect(h.eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'PropertyPacket', column: 'token', value: 'tok_ok' },
        { table: 'DealDocument', column: 'spaceId', value: 'space_1' },
        { table: 'DealDocument', column: 'id', value: 'doc_1' },
      ]),
    );
    expect(h.signedUrl).toHaveBeenCalledWith('deal-docs/space_1/contract.pdf', 60 * 5);
  });

  it('returns 500 without a URL when signing fails', async () => {
    h.packet = {
      includeDocumentIds: ['doc_1'],
      spaceId: 'space_1',
      expiresAt: null,
      revokedAt: null,
    };
    h.doc = { storagePath: 'deal-docs/space_1/contract.pdf', spaceId: 'space_1' };
    h.signedUrl.mockRejectedValue(new Error('kms down'));

    const res = await call('tok_ok', 'doc_1');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not generate download link' });
  });
});
