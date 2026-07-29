/** Browser-safe serialized workbook format shared by Workbench and its API. */
export interface StoredWorkbook {
  kind: 'chippi.workbook.v1';
  sourceAttachmentId: string;
  sourceFilename: string;
  sheetName: string;
  /** XLSX may contain multiple sheets; this slice intentionally imports one. */
  sourceSheetCount?: number;
  importedFirstSheetOnly?: boolean;
  columns: string[];
  rows: string[][];
}

export const MAX_WORKBOOK_CONTENT_BYTES = 2 * 1024 * 1024;
// The first-party editor renders a real input per cell; stay comfortably below
// a virtualized-grid threshold until that surface exists.
export const MAX_WORKBOOK_COLUMNS = 50;
export const MAX_WORKBOOK_ROWS = 500;
export const MAX_WORKBOOK_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_WORKBOOK_VERSION_METADATA_BYTES = 256;

/** Workbook edits accept one tiny, known metadata marker. Source provenance is
 * server-created by the open tool and is never accepted from PATCH clients. */
export function validateWorkbookVersionMetadata(value: unknown): { metadata: { kind?: 'chippi.workbook.v1' } | null; error?: string } {
  if (value === undefined) return { metadata: {} };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { metadata: null, error: 'Workbook metadata is invalid.' };
  const record = value as Record<string, unknown>;
  let encodedBytes: number;
  try { encodedBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength; } catch { return { metadata: null, error: 'Workbook metadata is invalid.' }; }
  if (encodedBytes > MAX_WORKBOOK_VERSION_METADATA_BYTES) return { metadata: null, error: 'Workbook metadata is too large.' };
  if (Object.keys(record).some((key) => key !== 'kind') || (record.kind !== undefined && record.kind !== 'chippi.workbook.v1')) {
    return { metadata: null, error: 'Workbook metadata contains unsupported fields.' };
  }
  const metadata: { kind?: 'chippi.workbook.v1' } = record.kind === 'chippi.workbook.v1' ? { kind: 'chippi.workbook.v1' } : {};
  return { metadata };
}

export function stringifyWorkbook(workbook: StoredWorkbook): string {
  return JSON.stringify(workbook);
}

export function parseStoredWorkbook(content: string): StoredWorkbook | null {
  return validateStoredWorkbookContent(content).workbook;
}

/** Strict server/client-independent validation for persisted workbook JSON. */
export function validateStoredWorkbookContent(content: string): { workbook: StoredWorkbook | null; error?: string } {
  if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > MAX_WORKBOOK_CONTENT_BYTES) {
    return { workbook: null, error: 'Workbook content is too large.' };
  }
  try {
    const value = JSON.parse(content) as Partial<StoredWorkbook>;
    if (value.kind !== 'chippi.workbook.v1' || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return { workbook: null, error: 'Workbook content has an invalid shape.' };
    const columns = value.columns;
    const rows = value.rows;
    if (columns.length === 0 || columns.length > MAX_WORKBOOK_COLUMNS || !columns.every((column) => typeof column === 'string' && column.length <= 256)) return { workbook: null, error: 'Workbook columns are invalid.' };
    if (rows.length > MAX_WORKBOOK_ROWS || !rows.every((row) => Array.isArray(row) && row.length === columns.length && row.every((cell) => typeof cell === 'string' && cell.length <= 32_000))) return { workbook: null, error: 'Workbook rows are invalid.' };
    if (
      typeof value.sourceAttachmentId !== 'string'
      || value.sourceAttachmentId.length === 0
      || value.sourceAttachmentId.length > 256
      || typeof value.sourceFilename !== 'string'
      || value.sourceFilename.length === 0
      || value.sourceFilename.length > 256
      || typeof value.sheetName !== 'string'
      || value.sheetName.length === 0
      || value.sheetName.length > 256
      || (value.sourceSheetCount !== undefined && (!Number.isInteger(value.sourceSheetCount) || value.sourceSheetCount < 1 || value.sourceSheetCount > 1_000))
      || (value.importedFirstSheetOnly !== undefined && typeof value.importedFirstSheetOnly !== 'boolean')
    ) {
      return { workbook: null, error: 'Workbook source metadata is invalid.' };
    }
    return { workbook: value as StoredWorkbook };
  } catch { return { workbook: null, error: 'Workbook content is not valid JSON.' }; }
}
