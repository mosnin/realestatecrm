import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mock = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), space: vi.fn(), rate: vi.fn(), enabled: vi.fn(), historyCount: 21, historyLimits: [] as number[], versionSelects: [] as string[] }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from } }));
vi.mock('@/lib/api-auth', () => ({ requireAuth: mock.auth }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: mock.space }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mock.rate }));
vi.mock('@/lib/agent/kill-switch', () => ({ assertSpaceEnabled: mock.enabled }));
vi.mock('@/lib/chippi/workbench-flag', () => ({ isWorkbenchEnabled: () => true }));

import { GET } from '@/app/api/agent/artifacts/[artifactId]/route';

const content = JSON.stringify({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'attachment-1', sourceFilename: 'buyers.csv', sheetName: 'Sheet1', columns: ['Name'], rows: [['Ada']] });

beforeEach(() => {
  vi.clearAllMocks();
  mock.historyLimits = [];
  mock.versionSelects = [];
  mock.historyCount = 21;
  mock.auth.mockResolvedValue({ userId: 'user-1' });
  mock.space.mockResolvedValue({ id: 'space-1' });
  mock.rate.mockResolvedValue({ allowed: true });
  mock.enabled.mockResolvedValue(undefined);
  mock.from.mockImplementation((table: string) => {
    let selected = '';
    const equals: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    const resolve = () => {
      if (table === 'Artifact') return { data: { id: 'artifact-1', spaceId: 'space-1', artifactType: 'workbook', currentVersionId: 'version-21', title: 'buyers.csv' }, error: null };
      if (selected === 'id, versionNumber, createdAt, createdByAgent') {
        return { data: Array.from({ length: mock.historyCount }, (_, index) => ({ id: `version-${mock.historyCount - index}`, versionNumber: mock.historyCount - index, createdAt: '2026-09-11T12:00:00.000Z', createdByAgent: index === mock.historyCount - 1 ? 'chippi' : 'user' })), error: null };
      }
      const isSource = equals.some(([field, value]) => field === 'versionNumber' && value === 1);
      return { data: { id: isSource ? 'version-1' : 'version-21', versionNumber: isSource ? 1 : 21, createdAt: '2026-09-11T12:00:00.000Z', createdByAgent: isSource ? 'chippi' : 'user', content }, error: null };
    };
    const pass = () => chain;
    chain.select = vi.fn((fields: string) => { selected = fields; if (table === 'ArtifactVersion') mock.versionSelects.push(fields); return chain; });
    chain.eq = vi.fn((field: string, value: unknown) => { equals.push([field, value]); return chain; });
    chain.order = vi.fn(pass);
    chain.limit = vi.fn((value: number) => { if (table === 'ArtifactVersion' && selected === 'id, versionNumber, createdAt, createdByAgent') mock.historyLimits.push(value); return chain; });
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolve()));
    chain.then = (done: (value: unknown) => unknown) => Promise.resolve(resolve()).then(done);
    return chain;
  });
});

describe('workbook artifact history', () => {
  it('fetches one sentinel row, returns 20 metadata-only versions, and marks only actual overflow incomplete', async () => {
    const response = await GET(new NextRequest('http://localhost/api/agent/artifacts/artifact-1'), { params: Promise.resolve({ artifactId: 'artifact-1' }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.artifact.versions).toHaveLength(20);
    expect(body.artifact.history).toEqual({ limit: 20, incomplete: true });
    expect(body.artifact.versions.every((version: Record<string, unknown>) => !('content' in version) && !('metadata' in version))).toBe(true);
    expect(mock.historyLimits).toEqual([21]);
    expect(mock.versionSelects).toContain('id, versionNumber, createdAt, createdByAgent');
    expect(mock.versionSelects).not.toContain('id, versionNumber, createdAt, createdByAgent, metadata');
  });

  it('does not claim history is incomplete when exactly 20 versions exist', async () => {
    mock.historyCount = 20;
    const response = await GET(new NextRequest('http://localhost/api/agent/artifacts/artifact-1'), { params: Promise.resolve({ artifactId: 'artifact-1' }) });
    const body = await response.json();
    expect(body.artifact.versions).toHaveLength(20);
    expect(body.artifact.history.incomplete).toBe(false);
  });
});
