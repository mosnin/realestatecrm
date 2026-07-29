import crypto from 'node:crypto';
import { parseDelimitedText, type ParsedTable } from '@/lib/documents/tabular';
import { parseXlsxBuffer } from '@/lib/documents/xlsx';
import {
  MAX_WORKBOOK_COLUMNS,
  MAX_WORKBOOK_ROWS,
  MAX_WORKBOOK_SOURCE_BYTES,
  stringifyWorkbook,
  type StoredWorkbook,
} from './workbench-format';
export { stringifyWorkbook, parseStoredWorkbook, type StoredWorkbook } from './workbench-format';
export { MAX_WORKBOOK_SOURCE_BYTES } from './workbench-format';

export function isWorkbookAttachment(input: { mimeType: string; filename: string }): boolean {
  // Extension is authoritative here. application/vnd.ms-excel is also used
  // for legacy BIFF .xls, which this XLSX/CSV parser cannot decode honestly.
  return /\.(csv|tsv|xlsx)$/i.test(input.filename);
}

export function workbookContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}


function fromTable(table: ParsedTable, sourceAttachmentId: string, sourceFilename: string, sheetName = 'Sheet1', sourceSheetCount = 1): StoredWorkbook {
  return { kind: 'chippi.workbook.v1', sourceAttachmentId, sourceFilename, sheetName, sourceSheetCount, importedFirstSheetOnly: sourceSheetCount > 1, columns: table.columns, rows: table.rows };
}

export async function workbookFromAttachmentBytes(input: {
  attachmentId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ workbook: StoredWorkbook } | { error: string }> {
  if (input.bytes.length === 0) return { error: 'The spreadsheet is empty.' };
  if (input.bytes.length > MAX_WORKBOOK_SOURCE_BYTES) {
    return { error: `Workbench currently supports spreadsheets up to ${MAX_WORKBOOK_SOURCE_BYTES / 1024 / 1024} MB.` };
  }
  if (/\.xls$/i.test(input.filename)) return { error: 'Legacy XLS files are not supported. Convert the file to CSV or XLSX and try again.' };
  const isXlsx = input.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || /\.xlsx$/i.test(input.filename);
  if (isXlsx) {
    const parsed = await parseXlsxBuffer(input.bytes);
    if ('error' in parsed) return parsed;
    const first = parsed.sheets[0];
    if (!first) return { error: 'The spreadsheet has no non-empty sheets.' };
    if (first.table.rowsTruncated || first.table.rows.length > MAX_WORKBOOK_ROWS) return { error: `The first sheet exceeds the ${MAX_WORKBOOK_ROWS}-row Workbench limit.` };
    if (first.table.columns.length > MAX_WORKBOOK_COLUMNS) return { error: `The first sheet exceeds the ${MAX_WORKBOOK_COLUMNS}-column Workbench limit.` };
    return { workbook: fromTable(first.table, input.attachmentId, input.filename, first.name, parsed.sheets.length) };
  }
  const isDelimited = input.mimeType === 'text/csv'
    || input.mimeType === 'text/tab-separated-values'
    || input.mimeType === 'application/csv'
    || /\.(csv|tsv)$/i.test(input.filename);
  if (!isDelimited) return { error: 'Workbench currently supports CSV, TSV, and XLSX attachments.' };
  const table = parseDelimitedText(input.bytes.toString('utf8'));
  if (table.rowsTruncated || table.rows.length > MAX_WORKBOOK_ROWS) return { error: `The spreadsheet exceeds the ${MAX_WORKBOOK_ROWS}-row Workbench limit.` };
  if (table.columns.length > MAX_WORKBOOK_COLUMNS) return { error: `The spreadsheet exceeds the ${MAX_WORKBOOK_COLUMNS}-column Workbench limit.` };
  return { workbook: fromTable(table, input.attachmentId, input.filename) };
}

/** Build a real XLSX from a selected immutable workbook version. */
export async function workbookToXlsxBytes(workbookData: StoredWorkbook): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default as unknown as typeof import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const safeSheetName = workbookData.sheetName
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet1';
  const sheet = workbook.addWorksheet(safeSheetName);
  sheet.addRow(workbookData.columns);
  for (const row of workbookData.rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
