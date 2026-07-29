import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { isWorkbookAttachment, parseStoredWorkbook, stringifyWorkbook, workbookContentHash, workbookFromAttachmentBytes, workbookFromWorkspaceCsvBytes, workbookToXlsxBytes } from '@/lib/chippi/workbench-store';
import { validateStoredWorkbookContent } from '@/lib/chippi/workbench-format';

describe('durable Chippi workbook content', () => {
  it('normalizes real CSV bytes and hashes the immutable source payload', async () => {
    const result = await workbookFromAttachmentBytes({ attachmentId: 'attachment-csv', filename: 'buyers.csv', mimeType: 'text/csv', bytes: Buffer.from('Name,Price\nAda,750000\n') });
    expect('workbook' in result && result.workbook.columns).toEqual(['Name', 'Price']);
    if (!('workbook' in result)) throw new Error(result.error);
    const content = stringifyWorkbook(result.workbook);
    expect(parseStoredWorkbook(content)?.sourceAttachmentId).toBe('attachment-csv');
    expect(workbookContentHash(content)).toHaveLength(64);
  });

  it('normalizes real XLSX bytes without retaining a mutable source file', async () => {
    const excel = new ExcelJS.Workbook();
    const sheet = excel.addWorksheet('Comps');
    sheet.addRows([['Address', 'Value'], ['1 Main St', 920000]]);
    excel.addWorksheet('Notes').addRows([['Note'], ['Second sheet is intentionally not imported']]);
    const result = await workbookFromAttachmentBytes({ attachmentId: 'attachment-xlsx', filename: 'comps.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: Buffer.from(await excel.xlsx.writeBuffer()) });
    expect('workbook' in result && result.workbook).toMatchObject({ sourceAttachmentId: 'attachment-xlsx', sheetName: 'Comps', sourceSheetCount: 2, importedFirstSheetOnly: true, columns: ['Address', 'Value'], rows: [['1 Main St', '920000']] });
  });

  it('exports a selected normalized version as a valid XLSX', async () => {
    const bytes = await workbookToXlsxBytes({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'source', sourceFilename: 'source.csv', sheetName: 'Edited', columns: ['Name'], rows: [['Edited value']] });
    const opened = new ExcelJS.Workbook();
    await opened.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(opened.getWorksheet('Edited')?.getCell('A2').value).toBe('Edited value');
  });

  it('rejects malformed and ragged workbook saves before a version can be inserted', () => {
    expect(validateStoredWorkbookContent('{oops}').workbook).toBeNull();
    expect(validateStoredWorkbookContent(JSON.stringify({ kind: 'chippi.workbook.v1', sourceAttachmentId: 'a', sourceFilename: 'a.csv', sheetName: 'Sheet1', columns: ['A', 'B'], rows: [['only-one']] })).error).toContain('rows');
  });

  it('only classifies actual spreadsheet attachments as Workbench candidates', () => {
    expect(isWorkbookAttachment({ mimeType: 'text/csv', filename: 'buyers.csv' })).toBe(true);
    expect(isWorkbookAttachment({ mimeType: 'text/tab-separated-values', filename: 'buyers.tsv' })).toBe(true);
    expect(isWorkbookAttachment({ mimeType: 'application/vnd.ms-excel', filename: 'legacy.csv' })).toBe(true);
    expect(isWorkbookAttachment({ mimeType: 'application/vnd.ms-excel', filename: 'legacy.xls' })).toBe(false);
    expect(isWorkbookAttachment({ mimeType: 'application/pdf', filename: 'open-this.pdf' })).toBe(false);
    expect(isWorkbookAttachment({ mimeType: 'image/png', filename: 'spreadsheet.png' })).toBe(false);
  });

  it('rejects legacy BIFF .xls explicitly instead of treating it as delimited text', async () => {
    const result = await workbookFromAttachmentBytes({ attachmentId: 'attachment-xls', filename: 'legacy.xls', mimeType: 'application/vnd.ms-excel', bytes: Buffer.from('not BIFF') });
    expect(result).toEqual({ error: 'Legacy XLS files are not supported. Convert the file to CSV or XLSX and try again.' });
  });

  it('normalizes TSV bytes as a supported Workbench source', async () => {
    const result = await workbookFromAttachmentBytes({ attachmentId: 'attachment-tsv', filename: 'buyers.tsv', mimeType: 'text/tab-separated-values', bytes: Buffer.from('Name\tPrice\nAda\t750000\n') });
    expect('workbook' in result && result.workbook.rows).toEqual([['Ada', '750000']]);
  });

  it('models a completed workspace CSV as workspace provenance, never as an attachment', () => {
    const result = workbookFromWorkspaceCsvBytes({
      sourceKind: 'task',
      runId: 'run-1',
      taskId: 'task-1',
      membershipId: 'task-file-1',
      fileId: 'file-1',
      filename: 'workspace-comps-1.csv',
      bytes: Buffer.from('address,list_price\n1 Main St,900000\n'),
    });
    if (!('workbook' in result)) throw new Error(result.error);
    expect(result.workbook).toMatchObject({
      source: { kind: 'workspace_file', membershipKind: 'task', runId: 'run-1', taskId: 'task-1', membershipId: 'task-file-1', fileId: 'file-1' },
      sourceFilename: 'workspace-comps-1.csv',
    });
    expect(result.workbook.sourceAttachmentId).toBeUndefined();
    expect(validateStoredWorkbookContent(stringifyWorkbook(result.workbook)).workbook).not.toBeNull();
  });

  it('rejects forged or mixed workspace workbook provenance', () => {
    const base = { kind: 'chippi.workbook.v1', sourceFilename: 'comps.csv', sheetName: 'Sheet1', columns: ['A'], rows: [['1']] };
    expect(validateStoredWorkbookContent(JSON.stringify({ ...base, source: { kind: 'workspace_file', membershipKind: 'root', runId: '', membershipId: 'member', fileId: 'file' } })).workbook).toBeNull();
    expect(validateStoredWorkbookContent(JSON.stringify({ ...base, sourceAttachmentId: 'fake-attachment', source: { kind: 'workspace_file', membershipKind: 'root', runId: 'run', membershipId: 'member', fileId: 'file' } })).workbook).toBeNull();
    expect(validateStoredWorkbookContent(JSON.stringify({ ...base, source: { kind: 'workspace_file', membershipKind: 'root', runId: 'run', membershipId: 'member', fileId: 'file', arbitrary: 'no' } })).workbook).toBeNull();
    expect(validateStoredWorkbookContent(JSON.stringify({ ...base, sourceAttachmentId: 'attachment-1', source: { kind: 'attachment', attachmentId: 'attachment-2' } })).workbook).toBeNull();
    expect(validateStoredWorkbookContent(JSON.stringify({ ...base, sourceAttachmentId: 'attachment-1', source: { kind: 'attachment', attachmentId: 'attachment-1', arbitrary: 'no' } })).workbook).toBeNull();
  });

  it('applies the same row and column limits to workspace CSV sources', () => {
    const tooManyRows = Array.from({ length: 501 }, (_, index) => `Buyer ${index}`).join('\n');
    const result = workbookFromWorkspaceCsvBytes({
      sourceKind: 'root',
      runId: 'run-1',
      membershipId: 'root-file-1',
      fileId: 'file-1',
      filename: 'comps.csv',
      bytes: Buffer.from(`Name\n${tooManyRows}\n`),
    });
    expect(result).toEqual({ error: 'The spreadsheet exceeds the 500-row Workbench limit.' });
  });

  it('rejects a 501-row source with the actual 500-row Workbench limit', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => `Buyer ${index}`).join('\n');
    const result = await workbookFromAttachmentBytes({ attachmentId: 'attachment-limit', filename: 'buyers.csv', mimeType: 'text/csv', bytes: Buffer.from(`Name\n${rows}\n`) });
    expect(result).toEqual({ error: 'The spreadsheet exceeds the 500-row Workbench limit.' });
  });
});
