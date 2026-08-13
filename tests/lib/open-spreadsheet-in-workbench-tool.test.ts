import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { ToolContext } from '@/lib/ai-tools/types';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), signedUrl: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock('@/lib/storage', () => ({ getSignedDownloadUrl: mock.signedUrl }));

import { openSpreadsheetInWorkbenchTool } from '@/lib/ai-tools/tools/open-spreadsheet-in-workbench';

const ctx: ToolContext = { userId: 'user-1', space: { id: 'space-1', slug: 'demo', name: 'Demo', ownerId: 'user-1' }, signal: new AbortController().signal, attachmentIds: ['attachment-1'] };
let attachment: Record<string, unknown>;
let attachmentEqCalls: unknown[][];

function installDb() {
  mock.from.mockImplementation((table: string) => {
    let operation = 'read';
    const result = () => {
      if (table === 'Attachment') return { data: attachment, error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((...args: unknown[]) => { if (table === 'Attachment') attachmentEqCalls.push(args); return chain; });
    chain.insert = vi.fn(() => { operation = 'insert'; return chain; });
    chain.update = vi.fn(() => { operation = 'update'; return chain; });
    chain.delete = vi.fn(() => { operation = 'delete'; return chain; });
    chain.maybeSingle = vi.fn(() => Promise.resolve(result()));
    chain.single = vi.fn(() => Promise.resolve(result()));
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED', 'true');
  attachment = { id: 'attachment-1', filename: 'buyers.csv', mimeType: 'text/csv', storagePath: 'chat-attachments/space-1/buyers.csv', sizeBytes: 128, conversationId: 'conversation-1' };
  attachmentEqCalls = [];
  mock.signedUrl.mockResolvedValue('https://example.test/private.csv');
  mock.rpc.mockResolvedValue({ data: [{ artifact_id: 'artifact-1', version_number: 1 }], error: null });
  installDb();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Name\nAda\n', { status: 200 })));
});

describe('open_spreadsheet_in_workbench tool', () => {
  it('is low-risk and approval-gated', () => {
    expect(openSpreadsheetInWorkbenchTool.riskLevel).toBe('low');
    expect(openSpreadsheetInWorkbenchTool.requiresApproval).toBe(true);
    expect(openSpreadsheetInWorkbenchTool.summariseCall?.({ attachmentId: 'attachment-1', attachmentFilename: 'buyers.csv' } as never)).toContain('buyers.csv');
  });

  it('tenant-scopes Attachment and rejects a non-spreadsheet before download', async () => {
    attachment = { ...attachment, filename: 'statement.pdf', mimeType: 'application/pdf' };
    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'attachment-1', attachmentFilename: 'statement.pdf' }, ctx);
    expect(result.display).toBe('error');
    expect(mock.signedUrl).not.toHaveBeenCalled();
    expect(attachmentEqCalls).toContainEqual(['spaceId', 'space-1']);
  });

  it('rejects legacy XLS clearly before download', async () => {
    attachment = { ...attachment, filename: 'legacy.xls', mimeType: 'application/vnd.ms-excel' };
    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'attachment-1', attachmentFilename: 'legacy.xls' }, ctx);
    expect(result.summary).toMatch(/Legacy XLS files are not supported/);
    expect(mock.signedUrl).not.toHaveBeenCalled();
  });

  it('refuses an attachment id that was not hydrated for the current turn', async () => {
    const result = await openSpreadsheetInWorkbenchTool.handler(
      { attachmentId: 'attachment-1', attachmentFilename: 'buyers.csv' },
      { ...ctx, attachmentIds: ['different-attachment'] },
    );
    expect(result.display).toBe('error');
    expect(mock.signedUrl).not.toHaveBeenCalled();
  });

  it('rejects an over-10MB attachment before download', async () => {
    attachment = { ...attachment, sizeBytes: 10 * 1024 * 1024 + 1 };
    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'attachment-1', attachmentFilename: 'buyers.csv' }, ctx);
    expect(result.display).toBe('error');
    expect(mock.signedUrl).not.toHaveBeenCalled();
  });

  it('uses the atomic create RPC and does not manufacture a partial artifact on failure', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'transaction failed' } });
    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'attachment-1', attachmentFilename: 'buyers.csv' }, ctx);
    expect(result.display).toBe('error');
    expect(mock.rpc).toHaveBeenCalledWith('create_workbook_artifact', expect.objectContaining({ p_space_id: 'space-1' }));
  });

  it('discloses and persists first-sheet-only scope for multi-sheet XLSX', async () => {
    const excel = new ExcelJS.Workbook();
    excel.addWorksheet('Comps').addRows([['Address'], ['1 Main St']]);
    excel.addWorksheet('Notes').addRows([['Note'], ['Not imported']]);
    const bytes = Buffer.from(await excel.xlsx.writeBuffer());
    attachment = { ...attachment, filename: 'comps.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: bytes.length };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })));

    const result = await openSpreadsheetInWorkbenchTool.handler({ attachmentId: 'attachment-1', attachmentFilename: 'comps.xlsx' }, ctx);
    expect(result.summary).toContain('first sheet');
    expect(result.summary).toContain('of 2');
    expect(mock.rpc).toHaveBeenCalledWith('create_workbook_artifact', expect.objectContaining({
      p_metadata: expect.objectContaining({ sourceSheetName: 'Comps', sourceSheetCount: 2, importedFirstSheetOnly: true }),
    }));
  });
});
