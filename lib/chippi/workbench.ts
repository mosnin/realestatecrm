/**
 * Pure workbook helpers for the feature-gated Chippi Workbench.
 *
 * This first slice intentionally keeps artifacts in the browser. The helpers
 * make the important product contract explicit now: source data is never
 * mutated, edits are measured as cells, and a save always creates a new
 * version rather than overwriting the source a user started from.
 */

export type WorkbenchCellValue = string | number;
export type WorkbenchRow = { id: string } & Record<string, WorkbenchCellValue>;

export interface WorkbenchColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface WorkbenchVersion {
  id: string;
  label: string;
  createdAt: string;
  author: 'Chippi' | 'You';
  rows: WorkbenchRow[];
  receipt?: WorkbenchChangeReceipt;
}

export interface WorkbenchChangeReceipt {
  sourceVersionId: string;
  savedAt: string;
  changedCells: Array<{ rowId: string; column: string; before: WorkbenchCellValue; after: WorkbenchCellValue }>;
}

export interface WorkbenchArtifact {
  id: string;
  title: string;
  subtitle: string;
  columns: WorkbenchColumn[];
  sourceVersion: WorkbenchVersion;
}

function isStoredWorkbookVersion(value: unknown): value is WorkbenchVersion {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkbenchVersion>;
  return (
    typeof candidate.id === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.createdAt === 'string'
    && (candidate.author === 'Chippi' || candidate.author === 'You')
    && Array.isArray(candidate.rows)
    && candidate.rows.every(
      (row) => row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string',
    )
  );
}

/**
 * Restores browser-local versions without ever trusting persisted data to
 * replace the canonical source snapshot supplied by Chippi.
 */
export function reconcileWorkbookVersions(
  sourceVersion: WorkbenchVersion,
  stored: unknown,
): WorkbenchVersion[] {
  if (!Array.isArray(stored)) return [sourceVersion];

  const seen = new Set([sourceVersion.id]);
  const savedVersions = stored.filter(isStoredWorkbookVersion).filter((version) => {
    if (seen.has(version.id)) return false;
    seen.add(version.id);
    return true;
  });

  return [sourceVersion, ...savedVersions];
}

/** Returns the next human-facing version number without reusing a label. */
export function nextWorkbookVersionNumber(versions: WorkbenchVersion[]): number {
  return Math.max(
    1,
    ...versions.map((version) => Number(version.label.replace(/\D/g, '')) || 1),
  ) + 1;
}

function cloneRows(rows: WorkbenchRow[]): WorkbenchRow[] {
  return rows.map((row) => ({ ...row }));
}

export function snapshotRows(rows: WorkbenchRow[]): WorkbenchRow[] {
  return cloneRows(rows);
}

export function updateWorkbookCell(
  rows: WorkbenchRow[],
  rowId: string,
  column: string,
  value: WorkbenchCellValue,
): WorkbenchRow[] {
  return rows.map((row) => (String(row.id) === rowId ? { ...row, [column]: value } : { ...row }));
}

export function changedWorkbookCells(
  before: WorkbenchRow[],
  after: WorkbenchRow[],
  columns: WorkbenchColumn[],
): WorkbenchChangeReceipt['changedCells'] {
  const beforeById = new Map(before.map((row) => [String(row.id), row]));

  return after.flatMap((row) => {
    const original = beforeById.get(String(row.id));
    if (!original) return [];

    return columns.flatMap((column) => {
      const previous = original[column.key];
      const next = row[column.key];
      return previous === next
        ? []
        : [{ rowId: String(row.id), column: column.key, before: previous, after: next }];
    });
  });
}

export function saveWorkbookVersion({
  artifactId,
  sourceVersion,
  rows,
  columns,
  now,
  versionNumber,
}: {
  artifactId: string;
  sourceVersion: WorkbenchVersion;
  rows: WorkbenchRow[];
  columns: WorkbenchColumn[];
  now: Date;
  /** Provided by the version collection so saving from an older view still
   * creates a monotonic label rather than duplicating Version 2. */
  versionNumber?: number;
}): WorkbenchVersion | null {
  const changedCells = changedWorkbookCells(sourceVersion.rows, rows, columns);
  if (changedCells.length === 0) return null;

  const createdAt = now.toISOString();
  const nextNumber = versionNumber ?? (Number(sourceVersion.label.replace(/\D/g, '')) || 1) + 1;
  return {
    id: `${artifactId}:v:${nextNumber}:${now.getTime()}`,
    label: `Version ${nextNumber}`,
    createdAt,
    author: 'You',
    rows: snapshotRows(rows),
    receipt: {
      sourceVersionId: sourceVersion.id,
      savedAt: createdAt,
      changedCells,
    },
  };
}

export const DEMO_PIPELINE_ARTIFACT: WorkbenchArtifact = {
  id: 'northstar-pipeline-plan',
  title: 'Northstar pipeline plan',
  subtitle: 'A working view Chippi prepared from your active opportunities.',
  columns: [
    { key: 'client', label: 'Client', align: 'left' },
    { key: 'stage', label: 'Stage', align: 'left' },
    { key: 'nextMove', label: 'Next move', align: 'left' },
    { key: 'target', label: 'Target', align: 'right' },
  ],
  sourceVersion: {
    id: 'northstar-pipeline-plan:source',
    label: 'Source',
    createdAt: '2026-07-29T13:30:00.000Z',
    author: 'Chippi',
    rows: [
      { id: 'jordan-lee', client: 'Jordan Lee', stage: 'Touring', nextMove: 'Confirm Saturday route', target: '$1.25M' },
      { id: 'morgan-price', client: 'Morgan Price', stage: 'Offer prep', nextMove: 'Review comp spread', target: '$860K' },
      { id: 'avery-nguyen', client: 'Avery Nguyen', stage: 'New lead', nextMove: 'Send neighborhood brief', target: '$740K' },
      { id: 'camille-reed', client: 'Camille Reed', stage: 'Negotiation', nextMove: 'Call listing agent', target: '$1.48M' },
    ],
  },
};
