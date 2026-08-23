/**
 * A completed DocuSign envelope updates signature status only.
 * Chippi is not the e-sign of record: it must not advance the deal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { advanceMock, executeMock, listAccountsMock, composioConfiguredMock } = vi.hoisted(() => ({
  advanceMock: vi.fn(async () => ({ ok: true, dealId: 'deal_1', created: false, moved: true })),
  executeMock: vi.fn(),
  listAccountsMock: vi.fn(async () => ({
    items: [{ toolkit: { slug: 'docusign' }, status: 'ACTIVE' }],
  })),
  composioConfiguredMock: vi.fn(() => true),
}));

vi.mock('@/lib/deals/advance-from-event', () => ({
  advanceDealFromEvent: advanceMock,
}));
vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
  listConnectedAccountsForEntity: listAccountsMock,
  loadToolsForEntity: vi.fn(async () => []),
  executeToolForEntity: executeMock,
}));
vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(),
  uploadObject: vi.fn(),
  buildKey: (...segs: string[]) => segs.join('/'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const insertedRows: Array<{ table: string; values: unknown }> = [];
function queue(table: string, terminal: Terminal) {
  (queues[table] ??= []).push(terminal);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queues[table] ?? [];
    const next = () => Promise.resolve(q.shift() ?? { data: null, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'update']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.insert = vi.fn((values: unknown) => {
      insertedRows.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => next());
    chain.single = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { refreshEnvelopeStatus, sendForSignature } from '@/lib/esign';
import { getSignedDownloadUrl } from '@/lib/storage';
import { CONTRACT_SPINE } from '@/lib/deals/default-pipelines';

const mockGetSignedDownloadUrl = vi.mocked(getSignedDownloadUrl);

const row = {
  id: 'sig_1',
  spaceId: 'space_1',
  dealId: 'deal_1',
  contactId: 'c_1',
  documentId: 'doc_1',
  envelopeId: 'env_1',
  subject: 'Purchase agreement',
  signerEmail: 'jane@example.com',
  signerName: 'Jane Doe',
  status: 'sent',
  signedDocumentUrl: null,
  completedAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  insertedRows.length = 0;
  composioConfiguredMock.mockReturnValue(true);
  listAccountsMock.mockResolvedValue({
    items: [{ toolkit: { slug: 'docusign' }, status: 'ACTIVE' }],
  });
  executeMock.mockReset();
  mockGetSignedDownloadUrl.mockResolvedValue('https://signed.example/doc.pdf');
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer,
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshEnvelopeStatus — realtor owns the contract', () => {
  it('does not treat a completed envelope as offer accepted', async () => {
    expect(CONTRACT_SPINE).toBe('realtor');

    queue('SignatureRequest', { data: { ...row }, error: null });
    executeMock
      .mockResolvedValueOnce({ successful: true, data: { status: 'completed' } })
      .mockResolvedValueOnce({ successful: false });
    queue('SignatureRequest', { data: { ...row, status: 'completed' }, error: null });

    const result = await refreshEnvelopeStatus({
      userId: 'clerk_1',
      signatureRequestId: 'sig_1',
      spaceId: 'space_1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signatureRequest.status).toBe('completed');
    }
    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('does not move the pipeline when the envelope is still in flight', async () => {
    queue('SignatureRequest', { data: { ...row, status: 'sent' }, error: null });
    executeMock.mockResolvedValueOnce({ successful: true, data: { status: 'delivered' } });
    queue('SignatureRequest', { data: { ...row, status: 'delivered' }, error: null });

    await refreshEnvelopeStatus({
      userId: 'clerk_1',
      signatureRequestId: 'sig_1',
      spaceId: 'space_1',
    });

    expect(advanceMock).not.toHaveBeenCalled();
  });

  it('does not invent a deal for a signature with no dealId', async () => {
    queue('SignatureRequest', { data: { ...row, dealId: null }, error: null });
    executeMock
      .mockResolvedValueOnce({ successful: true, data: { status: 'completed' } })
      .mockResolvedValueOnce({ successful: false });
    queue('SignatureRequest', { data: { ...row, dealId: null, status: 'completed' }, error: null });

    await refreshEnvelopeStatus({
      userId: 'clerk_1',
      signatureRequestId: 'sig_1',
      spaceId: 'space_1',
    });

    expect(advanceMock).not.toHaveBeenCalled();
  });
});

describe('sendForSignature — tenant document scoping and persist honesty', () => {
  const input = {
    userId: 'clerk_1',
    spaceId: 'space_1',
    documentId: 'doc_1',
    dealId: 'deal_1',
    signerEmail: '  Buyer@Example.COM ',
    signerName: 'Jane Doe',
    subject: 'Please sign',
  };

  function queueDocument() {
    queue('DealDocument', {
      data: {
        id: 'doc_1',
        dealId: 'deal_1',
        label: 'Purchase agreement',
        storagePath: 'dealDocuments/space_1/doc.pdf',
        contentType: 'application/pdf',
      },
      error: null,
    });
  }

  it('refuses a document that is not in the caller space', async () => {
    queue('DealDocument', { data: null, error: null });

    const result = await sendForSignature(input);

    expect(result).toEqual({ ok: false, reason: 'document_not_found' });
    expect(executeMock).not.toHaveBeenCalled();
    expect(insertedRows).toHaveLength(0);
  });

  it('does not create an envelope when the stored file cannot be read', async () => {
    queueDocument();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })));

    const result = await sendForSignature(input);

    expect(result).toEqual({ ok: false, reason: 'document_unreadable' });
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('reports persist_failed after DocuSign accepted the envelope', async () => {
    queueDocument();
    executeMock.mockResolvedValueOnce({ successful: true, data: { envelopeId: 'env_orphan' } });
    queue('SignatureRequest', { data: null, error: { message: 'insert failed' } });

    const result = await sendForSignature(input);

    expect(result).toEqual({ ok: false, reason: 'persist_failed' });
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes the signer email and records a sent SignatureRequest', async () => {
    queueDocument();
    executeMock.mockResolvedValueOnce({
      successful: true,
      data: { response_data: { envelope_id: 'env_nested' } },
    });
    const saved = {
      ...row,
      envelopeId: 'env_nested',
      signerEmail: 'buyer@example.com',
      status: 'sent',
    };
    queue('SignatureRequest', { data: saved, error: null });

    const result = await sendForSignature(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.signatureRequest.envelopeId).toBe('env_nested');
      expect(result.signatureRequest.status).toBe('sent');
    }
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'clerk_1',
      slug: 'DOCUSIGN_CREATE_ENVELOPE',
      arguments: expect.objectContaining({
        emailSubject: 'Please sign',
        recipients: expect.objectContaining({
          signers: [expect.objectContaining({ email: 'buyer@example.com', name: 'Jane Doe' })],
        }),
      }),
    }));
    expect(insertedRows[0]?.values).toMatchObject({
      spaceId: 'space_1',
      documentId: 'doc_1',
      envelopeId: 'env_nested',
      signerEmail: 'buyer@example.com',
      status: 'sent',
    });
    expect(advanceMock).not.toHaveBeenCalled();
  });
});
