/**
 * A completed DocuSign envelope on a deal is the e-sign spine: it advances
 * the deal as offer-accepted (Under Contract + contractAcceptedAt).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/deals/default-pipelines', async () => {
  const actual = await vi.importActual<typeof import('@/lib/deals/default-pipelines')>(
    '@/lib/deals/default-pipelines',
  );
  return { ...actual, CONTRACT_SPINE: 'esign' };
});
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
    chain.insert = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => next());
    chain.single = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { refreshEnvelopeStatus } from '@/lib/esign';

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
  composioConfiguredMock.mockReturnValue(true);
  listAccountsMock.mockResolvedValue({
    items: [{ toolkit: { slug: 'docusign' }, status: 'ACTIVE' }],
  });
  executeMock.mockReset();
});

describe('refreshEnvelopeStatus — e-sign spine', () => {
  it('advances the deal when the envelope completes', async () => {
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
    expect(advanceMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      dealId: 'deal_1',
      event: 'offer_accepted',
      title: 'Jane Doe',
    });
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
