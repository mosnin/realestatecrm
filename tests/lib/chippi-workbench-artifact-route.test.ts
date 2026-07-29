import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stringifyWorkbook } from '@/lib/chippi/workbench-format';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), auth: vi.fn(), space: vi.fn(), rate: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: mock.auth }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: mock.space }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mock.rate }));
vi.mock('@/lib/agent/kill-switch', () => ({ assertSpaceEnabled: mock.enabled }));
vi.mock('@/lib/chippi/workbench-flag', () => ({ isWorkbenchEnabled: () => true }));

import { PATCH } from '@/app/api/agent/artifacts/[artifactId]/route';

const artifact = { id: 'artifact-1', spaceId: 'space-1', artifactType: 'workbook' };
const validContent = stringifyWorkbook({
  kind: 'chippi.workbook.v1', sourceAttachmentId: 'attachment-1', sourceFilename: 'buyers.csv', sheetName: 'Sheet1', columns: ['Name', 'Price'], rows: [['Ada', '750000']],
});

let inserts: Array<{ table: string; value: Record<string, unknown> }>;

function installDb() {
  mock.from.mockImplementation((table: string) => {
    let operation = 'read';
    const resolved = () => {
      if (table === 'Artifact' && operation === 'read') return { data: artifact, error: null };
      if (table === 'ArtifactVersion' && operation === 'read') return { data: { versionNumber: 4 }, error: null };
      if (table === 'ArtifactVersion' && operation === 'insert') return { data: { id: 'server-version-5', versionNumber: 5, createdByAgent: 'user' }, error: null };
      if (table === 'Artifact' && operation === 'update') return { data: { ...artifact, currentVersionId: 'server-version-5' }, error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    const pass = () => chain;
    chain.select = vi.fn(pass); chain.eq = vi.fn(pass); chain.order = vi.fn(pass); chain.limit = vi.fn(pass);
    chain.insert = vi.fn((value: Record<string, unknown>) => { operation = 'insert'; inserts.push({ table, value }); return chain; });
    chain.update = vi.fn(() => { operation = 'update'; return chain; });
    chain.delete = vi.fn(() => { operation = 'delete'; return chain; });
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolved()));
    chain.single = vi.fn(() => Promise.resolve(resolved()));
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolved()).then(resolve);
    return chain;
  });
}

beforeEach(() => {
  mock.rpc.mockClear();
  inserts = [];
  mock.auth.mockResolvedValue({ userId: 'user-1' });
  mock.space.mockResolvedValue({ id: 'space-1' });
  mock.rate.mockResolvedValue({ allowed: true });
  mock.enabled.mockResolvedValue(undefined);
  mock.rpc.mockResolvedValue({ data: [{ version_id: 'server-version-5', version_number: 5, created_at: '2026-09-11T12:00:00.000Z' }], error: null });
  installDb();
});

describe('workbook artifact PATCH', () => {
  it.each(['{not json}', stringifyWorkbook({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'a', sourceFilename: 'a.csv', sheetName: 'Sheet1', columns: ['A', 'B'], rows: [['ragged']] })])('rejects malformed workbook content before insert', async (content) => {
    const response = await PATCH({ json: async () => ({ content }) } as never, { params: Promise.resolve({ artifactId: artifact.id }) });
    expect(response.status).toBe(400);
    expect(inserts).toEqual([]);
  });

  it('returns the exact user-authored server version', async () => {
    const response = await PATCH({ json: async () => ({ content: validContent, metadata: { kind: 'chippi.workbook.v1' } }) } as never, { params: Promise.resolve({ artifactId: artifact.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifact.newVersion).toEqual({ id: 'server-version-5', versionNumber: 5, createdAt: '2026-09-11T12:00:00.000Z', createdByAgent: 'user' });
    expect(mock.rpc).toHaveBeenCalledWith('append_workbook_artifact_version', expect.objectContaining({ p_space_id: 'space-1', p_artifact_id: artifact.id }));
  });

  it('fails closed for a disabled space before invoking the append RPC', async () => {
    mock.enabled.mockRejectedValueOnce(new Error('disabled'));
    const response = await PATCH({ json: async () => ({ content: validContent }) } as never, { params: Promise.resolve({ artifactId: artifact.id }) });
    expect(response.status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { arbitrary: 'not allowed' },
    { kind: `chippi.workbook.v1${'x'.repeat(300)}` },
  ])('rejects unsupported or oversized PATCH metadata before the append RPC', async (metadata) => {
    const response = await PATCH({ json: async () => ({ content: validContent, metadata }) } as never, { params: Promise.resolve({ artifactId: artifact.id }) });
    expect(response.status).toBe(400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
