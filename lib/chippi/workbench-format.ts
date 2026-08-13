export type StoredWorkbookSource =
  | { kind: 'attachment'; attachmentId: string }
  | {
      kind: 'workspace_file';
      membershipKind: 'root' | 'task';
      runId: string;
      taskId?: string;
      membershipId: string;
      fileId: string;
    };

/** Browser-safe serialized workbook format shared by Workbench and its API. */
export interface StoredWorkbook {
  kind: 'chippi.workbook.v1';
  /** Legacy attachment workbooks predate the discriminated source field. */
  sourceAttachmentId?: string;
  source?: StoredWorkbookSource;
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

/** A new immutable version may change cells/columns, but never the identity or
 * import scope of the source Chippi originally copied into Workbench. */
export function hasSameWorkbookSource(left: StoredWorkbook, right: StoredWorkbook): boolean {
  return JSON.stringify(normalizedWorkbookSource(left)) === JSON.stringify(normalizedWorkbookSource(right));
}

function normalizedWorkbookSource(workbook: StoredWorkbook): Record<string, unknown> {
  const source = workbook.source?.kind === 'workspace_file'
    ? {
        kind: 'workspace_file',
        membershipKind: workbook.source.membershipKind,
        runId: workbook.source.runId,
        taskId: workbook.source.taskId ?? null,
        membershipId: workbook.source.membershipId,
        fileId: workbook.source.fileId,
      }
    : {
        kind: 'attachment',
        attachmentId: workbook.source?.kind === 'attachment'
          ? workbook.source.attachmentId
          : workbook.sourceAttachmentId,
      };
  return {
    source,
    sourceFilename: workbook.sourceFilename,
    sheetName: workbook.sheetName,
    sourceSheetCount: workbook.sourceSheetCount ?? 1,
    importedFirstSheetOnly: workbook.importedFirstSheetOnly === true,
  };
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
    const legacyAttachmentIdValid = typeof value.sourceAttachmentId === 'string'
      && value.sourceAttachmentId.length > 0
      && value.sourceAttachmentId.length <= 256;
    const source = value.source;
    const sourceKeys = source && typeof source === 'object' && !Array.isArray(source)
      ? Object.keys(source).sort()
      : [];
    const explicitAttachmentValid = source?.kind === 'attachment'
      && sourceKeys.join(',') === 'attachmentId,kind'
      && typeof source.attachmentId === 'string'
      && source.attachmentId.length > 0
      && source.attachmentId.length <= 256
      && legacyAttachmentIdValid
      && source.attachmentId === value.sourceAttachmentId;
    const workspaceSourceValid = source?.kind === 'workspace_file'
      && value.sourceAttachmentId === undefined
      && (source.membershipKind === 'root' || source.membershipKind === 'task')
      && sourceKeys.join(',') === (
        source.membershipKind === 'task'
          ? 'fileId,kind,membershipId,membershipKind,runId,taskId'
          : 'fileId,kind,membershipId,membershipKind,runId'
      )
      && validSourceId(source.runId)
      && validSourceId(source.membershipId)
      && validSourceId(source.fileId)
      && (
        (source.membershipKind === 'root' && source.taskId === undefined)
        || (source.membershipKind === 'task' && validSourceId(source.taskId))
      );
    const sourceValid = source === undefined ? legacyAttachmentIdValid : explicitAttachmentValid || workspaceSourceValid;
    if (
      !sourceValid
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

function validSourceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
