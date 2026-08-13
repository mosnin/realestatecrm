import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '@/lib/ai-tools/types';
import { stringifyWorkbook } from '@/lib/chippi/workbench-format';
import { workbookContentHash } from '@/lib/chippi/workbench-store';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));

import { applyWorkbookTransformationTool, inspectWorkbookTool } from '@/lib/ai-tools/tools/workbook-transform';

const ctx: ToolContext = { userId: 'user-1', space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'user-1' }, signal: new AbortController().signal, activeWorkbook: { artifactId: 'artifact-1', versionNumber: 1, title: 'buyers.csv' } };
const content = stringifyWorkbook({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'attachment-1', sourceFilename: 'buyers.csv', sheetName: 'Sheet1', columns: ['Email', 'Phone'], rows: [[' ADA@EXAMPLE.COM ', '(212) 555-0123 ']] });
const contentHash = workbookContentHash(content);
let equalityCalls: unknown[][];
let artifactRow: { id: string; title: string; artifactType: string } | null;

function installDb(version = { id: 'version-1', versionNumber: 1, content, contentHash }) {
  mock.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((...args: unknown[]) => { equalityCalls.push([table, ...args]); return chain; });
    chain.maybeSingle = vi.fn(async () => table === 'Artifact'
      ? { data: artifactRow, error: null }
      : { data: version, error: null });
    return chain;
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'true');
  equalityCalls = [];
  artifactRow = { id: 'artifact-1', title: 'buyers.csv', artifactType: 'workbook' };
  mock.from.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({ data: [{ version_id: 'version-2', version_number: 2 }], error: null });
  installDb();
});

describe('workbook transformation tools', () => {
  it('exposes inspection as a read-only bounded lookup with tenant-scoped artifact/version queries', async () => {
    expect(inspectWorkbookTool.requiresApproval).toBe(false);
    const result = await inspectWorkbookTool.handler({ artifactId: 'artifact-1', versionNumber: 1 }, ctx);
    expect(result.data).toMatchObject({ artifactId: 'artifact-1', versionId: 'version-1', contentHash, inspection: { rowCount: 1 } });
    expect(equalityCalls).toContainEqual(['Artifact', 'spaceId', 'space-1']);
    expect(equalityCalls).toContainEqual(['ArtifactVersion', 'spaceId', 'space-1']);
  });

  it('requires approval and names every approved operation target', () => {
    expect(applyWorkbookTransformationTool.requiresApproval).toBe(true);
    const summary = applyWorkbookTransformationTool.summariseCall?.({
      artifactId: 'artifact-1', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash,
      workbookTitle: 'buyers.csv',
      operations: [
        { type: 'normalize_email', column: 'Email' },
        { type: 'deduplicate_rows', columns: ['Email', 'Phone'] },
        { type: 'add_constant_column', column: 'Import tag', value: 'July' },
      ],
    });
    expect(summary).toContain('Email');
    expect(summary).toContain('Phone');
    expect(summary).toContain('Import tag');
    expect(summary).toContain('buyers.csv');
    expect(summary).not.toContain('…');
  });

  it('names every target in the maximum approved operation set without ellipsis', () => {
    const summary = applyWorkbookTransformationTool.summariseCall?.({
      artifactId: 'artifact-1', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash,
      workbookTitle: 'buyers.csv',
      operations: Array.from({ length: 6 }, (_, index) => ({ type: 'trim_whitespace' as const, columns: [`Column ${index}`] })),
    });
    for (let index = 0; index < 6; index += 1) expect(summary).toContain(`Column ${index}`);
    expect(summary).not.toContain('…');
  });

  it('uses the locked transform RPC with exact source id, version, hash, and a redacted receipt', async () => {
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash,
      operations: [{ type: 'normalize_email', column: 'Email' }, { type: 'add_constant_column', column: 'Import tag', value: 'July' }],
    }, ctx);
    expect(result.display).toBe('workbench');
    expect(result.data).toMatchObject({ artifactId: 'artifact-1', versionNumber: 2 });
    expect(mock.rpc).toHaveBeenCalledWith('append_transformed_workbook_artifact_version', expect.objectContaining({
      p_artifact_id: 'artifact-1', p_space_id: 'space-1', p_source_version_id: 'version-1', p_source_version_number: 1, p_expected_content_hash: contentHash,
      p_metadata: expect.objectContaining({ kind: 'chippi.workbook.transform.v1', sourceVersionId: 'version-1' }),
    }));
    const rpcArgs = mock.rpc.mock.calls[0]?.[1] as { p_metadata: { operations: Array<Record<string, unknown>> } };
    expect(rpcArgs.p_metadata.operations[1]).not.toHaveProperty('value');
  });

  it('fails closed on a stale inspected source without calling the RPC', async () => {
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'old-version', sourceVersionNumber: 1, expectedContentHash: contentHash,
      operations: [{ type: 'normalize_email', column: 'Email' }],
    }, ctx);
    expect(result.display).toBe('warning');
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('makes a foreign or missing workbook indistinguishable and never calls the append RPC', async () => {
    const result = await inspectWorkbookTool.handler({ artifactId: 'foreign-or-missing', versionNumber: 1 }, ctx);
    expect(result.display).toBe('warning');
    expect(result.summary).toMatch(/open the workbook/i);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when inspection does not match the server-validated active workbook', async () => {
    const result = await inspectWorkbookTool.handler({ artifactId: 'artifact-1', versionNumber: 2 }, ctx);
    expect(result.display).toBe('warning');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('rejects a transform aimed at another active workbook, version, or title before any read/write', async () => {
    const base = { artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash, operations: [{ type: 'normalize_email' as const, column: 'Email' }] };
    for (const mismatch of [
      { ...base, artifactId: 'artifact-2' },
      { ...base, sourceVersionNumber: 2 },
      { ...base, workbookTitle: 'other.csv' },
    ]) {
      const result = await applyWorkbookTransformationTool.handler(mismatch, ctx);
      expect(result.display).toBe('warning');
    }
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('rejects a loaded workbook whose title differs from the approved active title', async () => {
    artifactRow = { id: 'artifact-1', title: 'renamed.csv', artifactType: 'workbook' };
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash,
      operations: [{ type: 'normalize_email', column: 'Email' }],
    }, ctx);
    expect(result.display).toBe('warning');
    expect(result.summary).toMatch(/changed/i);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('fails closed on a stale content hash without calling the RPC', async () => {
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: 'f'.repeat(64),
      operations: [{ type: 'normalize_email', column: 'Email' }],
    }, ctx);
    expect(result.display).toBe('warning');
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('turns an atomic RPC stale rejection into a harmless retry state', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'workbook version is stale' } });
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: contentHash,
      operations: [{ type: 'normalize_email', column: 'Email' }],
    }, ctx);
    expect(result.display).toBe('warning');
    expect(result.summary).toMatch(/changed while this approval was pending/i);
  });

  it('does not create a version for a no-op transformation', async () => {
    const alreadyNormal = stringifyWorkbook({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'attachment-1', sourceFilename: 'buyers.csv', sheetName: 'Sheet1', columns: ['Email'], rows: [['ada@example.com']] });
    installDb({ id: 'version-1', versionNumber: 1, content: alreadyNormal, contentHash: workbookContentHash(alreadyNormal) });
    const result = await applyWorkbookTransformationTool.handler({
      artifactId: 'artifact-1', workbookTitle: 'buyers.csv', sourceVersionId: 'version-1', sourceVersionNumber: 1, expectedContentHash: workbookContentHash(alreadyNormal),
      operations: [{ type: 'normalize_email', column: 'Email' }],
    }, ctx);
    expect(result.display).toBe('warning');
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('fails closed while feature-off before tenant lookup', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'false');
    const result = await inspectWorkbookTool.handler({ artifactId: 'artifact-1', versionNumber: 1 }, ctx);
    expect(result.display).toBe('warning');
    expect(mock.from).not.toHaveBeenCalled();
  });
});
