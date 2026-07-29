'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Download, FileSpreadsheet, History, RotateCcw, Save, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  nextWorkbookVersionNumber,
  mergeWorkbenchVersionOptions,
  reconcileWorkbookVersions,
  saveWorkbookVersion,
  snapshotRows,
  updateWorkbookCell,
  type WorkbenchArtifact,
  type WorkbenchCellValue,
  type WorkbenchRow,
  type WorkbenchTransformationReceipt,
  type WorkbenchVersion,
} from '@/lib/chippi/workbench';
import { parseStoredWorkbook, stringifyWorkbook, type StoredWorkbook } from '@/lib/chippi/workbench-format';

const STORAGE_PREFIX = 'chippi:workbench:v1:';

type WorkbenchState = 'ready' | 'empty' | 'error';

interface LiveWorkbenchProps {
  artifact?: WorkbenchArtifact;
  artifactId?: string | null;
  /** Bumps only after an approved agent transform, forcing a current-version refetch. */
  refreshVersionNumber?: number | null;
  state?: WorkbenchState;
  className?: string;
}

interface PersistedWorkbookView {
  artifact: WorkbenchArtifact;
  versions: WorkbenchVersion[];
  sourceWorkbook: StoredWorkbook;
  history: PersistedVersionMeta[];
  historyIncomplete: boolean;
}

interface PersistedVersionMeta {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdByAgent?: string;
  transformReceipt?: unknown;
}

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function storageKey(artifactId: string): string {
  return `${STORAGE_PREFIX}${artifactId}`;
}

function readStoredVersions(artifact: WorkbenchArtifact): WorkbenchVersion[] {
  if (typeof window === 'undefined') return [artifact.sourceVersion];
  try {
    const raw = window.localStorage.getItem(storageKey(artifact.id));
    const parsed = raw ? JSON.parse(raw) : null;
    return reconcileWorkbookVersions(artifact.sourceVersion, parsed);
  } catch {
    return [artifact.sourceVersion];
  }
}

function persistVersions(artifact: WorkbenchArtifact, versions: WorkbenchVersion[]): void {
  try {
    window.localStorage.setItem(storageKey(artifact.id), JSON.stringify(versions));
  } catch {
    // Storage is a convenience in Slice A. The visible editor remains usable
    // for the current session if the browser denies storage.
  }
}

function isTransformationReceipt(value: unknown): value is WorkbenchTransformationReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<WorkbenchTransformationReceipt>;
  return receipt.kind === 'chippi.workbook.transform.v1'
    && typeof receipt.changedCells === 'number'
    && typeof receipt.removedRows === 'number'
    && Array.isArray(receipt.operations)
    && Array.isArray(receipt.addedColumns)
    && typeof receipt.savedAt === 'string'
    && typeof receipt.sourceVersionNumber === 'number';
}

function describeTransformationOperation(operation: WorkbenchTransformationReceipt['operations'][number]): string {
  switch (operation.type) {
    case 'trim_whitespace': return `trim ${operation.columns?.join(', ')}`;
    case 'rename_column': return `rename ${operation.from} → ${operation.to}`;
    case 'normalize_email': return `normalize email in ${operation.column}`;
    case 'normalize_phone': return `normalize phone in ${operation.column}`;
    case 'deduplicate_rows': return `deduplicate by ${operation.columns?.join(' + ')}`;
    case 'add_constant_column': return `add ${operation.column}${operation.valuePreview ? ` = “${operation.valuePreview}”` : ''}`;
    default: return operation.type;
  }
}

function Receipt({ version }: { version: WorkbenchVersion }) {
  if (!version.receipt) {
    if (version.author === 'You') {
      return (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-foreground/75">
          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Your saved version from {formatSavedAt(version.createdAt)}. The source attachment remains unchanged.</span>
        </div>
      );
    }
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-foreground/65" />
        <span>Source snapshot created by Chippi. Your edits are saved as a new version.</span>
      </div>
    );
  }

  if (isTransformationReceipt(version.receipt)) {
    const operationCount = version.receipt.operations.length;
    return (
      <div aria-live="polite" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-foreground/75">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>Chippi applied {operationCount} approved {operationCount === 1 ? 'transformation' : 'transformations'} to version {version.receipt.sourceVersionNumber}: {describeTransformationOperation(version.receipt.operations[0])}{operationCount > 1 ? `; ${version.receipt.operations.slice(1).map(describeTransformationOperation).join('; ')}` : ''}. {version.receipt.changedCells} cell changes{version.receipt.removedRows ? `, ${version.receipt.removedRows} duplicate rows removed` : ''}. The source version remains unchanged.</span>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-foreground/75"
    >
      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span>
        Saved {version.receipt.changedCells.length} {version.receipt.changedCells.length === 1 ? 'cell change' : 'cell changes'} at{' '}
        {formatSavedAt(version.receipt.savedAt)}. The source remains unchanged.
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-border/60 bg-muted/35 shadow-sm">
        <FileSpreadsheet className="size-5 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-semibold tracking-tight">Nothing in the workbench yet</h2>
      <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
        When Chippi prepares a plan, analysis, or spreadsheet, it will appear here for you to refine.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] shadow-sm">
        <RotateCcw className="size-5 text-amber-700 dark:text-amber-400" />
      </div>
      <h2 className="text-sm font-semibold tracking-tight">Workbench is temporarily unavailable</h2>
      <p className="mt-1.5 max-w-[17rem] text-xs leading-relaxed text-muted-foreground">
        Your existing work was not changed. Try opening the panel again in a moment.
      </p>
    </div>
  );
}

/**
 * Feature-off Workbench. Fixture previews remain browser-local; an artifact id
 * uses the tenant-scoped durable API and appends immutable versions.
 */
export function LiveWorkbench({ artifact, artifactId, refreshVersionNumber, state = 'ready', className }: LiveWorkbenchProps) {
  if (state === 'empty') return <EmptyState />;
  if (state === 'error') return <ErrorState />;
  if (artifactId) return <PersistedWorkbench artifactId={artifactId} refreshVersionNumber={refreshVersionNumber} className={className} />;
  if (!artifact) return <EmptyState />;

  return <WorkbenchEditor artifact={artifact} className={className} />;
}

function PersistedWorkbench({ artifactId, refreshVersionNumber, className }: { artifactId: string; refreshVersionNumber?: number | null; className?: string }) {
  const [view, setView] = useState<PersistedWorkbookView | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setView(null); setError(false);
    void fetch(`/api/agent/artifacts/${encodeURIComponent(artifactId)}`, { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error('load failed')))
      .then((payload) => active && setView(fromPersistedArtifact(payload.artifact)))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, [artifactId, refreshVersionNumber]);
  if (error) return <ErrorState />;
  if (!view) return <div className="p-5 text-xs text-muted-foreground">Loading workbook…</div>;
  const loadVersion = async (versionNumber: number) => {
    const response = await fetch(`/api/agent/artifacts/${encodeURIComponent(artifactId)}?version=${encodeURIComponent(String(versionNumber))}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('version load failed');
    const payload = await response.json() as { version?: PersistedVersionMeta & { content?: unknown } };
    if (!payload.version || typeof payload.version.content !== 'string') throw new Error('invalid version payload');
    const workbook = parseStoredWorkbook(payload.version.content);
    if (!workbook) throw new Error('invalid workbook');
    return toVersion(artifactId, payload.version as PersistedVersionMeta & { content: string }, workbook);
  };
  return <WorkbenchEditor key={`${artifactId}:${refreshVersionNumber ?? view.versions.at(-1)?.id ?? 'current'}`} artifact={view.artifact} versions={view.versions} sourceWorkbook={view.sourceWorkbook} history={view.history} historyIncomplete={view.historyIncomplete} loadVersion={loadVersion} className={className} persist />;
}

function fromPersistedArtifact(value: { id: string; title: string; versions?: PersistedVersionMeta[]; sourceVersion?: PersistedVersionMeta & { content: string }; currentVersion?: PersistedVersionMeta & { content: string }; history?: { incomplete?: boolean } }): PersistedWorkbookView {
  if (!value.sourceVersion || !value.currentVersion) throw new Error('missing workbook');
  const workbook = parseStoredWorkbook(value.sourceVersion.content);
  const currentWorkbook = parseStoredWorkbook(value.currentVersion.content);
  if (!workbook || !currentWorkbook) throw new Error('invalid workbook');
  const source = toVersion(value.id, value.sourceVersion, workbook);
  const current = toVersion(value.id, value.currentVersion, currentWorkbook);
  const versions = source.id === current.id ? [source] : [source, current];
  const history: PersistedVersionMeta[] = [...(value.versions ?? []), value.sourceVersion, value.currentVersion]
    .map(({ id, versionNumber, createdAt, createdByAgent, transformReceipt }) => ({ id, versionNumber: Number(versionNumber), createdAt, createdByAgent, transformReceipt }))
    .filter((version, index, all) => all.findIndex((candidate) => candidate.id === version.id) === index)
    .sort((a, b) => a.versionNumber - b.versionNumber);
  const sheetScope = workbook.importedFirstSheetOnly && (workbook.sourceSheetCount ?? 1) > 1
    ? `Showing first sheet “${workbook.sheetName}” of ${workbook.sourceSheetCount}.`
    : `Showing sheet “${workbook.sheetName}”.`;
  return { artifact: {
    id: value.id, title: value.title, subtitle: `Source: ${workbook.sourceFilename}. ${sheetScope} Edits are saved as immutable versions.`,
    columns: workbook.columns.map((label, index) => ({ key: `c${index}`, label })), sourceVersion: source,
  }, versions, sourceWorkbook: workbook, history, historyIncomplete: value.history?.incomplete === true };
}

function toVersion(artifactId: string, version: { id: string; versionNumber: number; createdAt: string; createdByAgent?: string; content: string; transformReceipt?: unknown }, workbook: StoredWorkbook): WorkbenchVersion {
  return { id: version.id, versionNumber: version.versionNumber, label: version.versionNumber === 1 ? 'Source' : `Version ${version.versionNumber}`, createdAt: version.createdAt,
    author: version.versionNumber === 1 || version.createdByAgent === 'chippi' || version.createdByAgent === 'chippi_transform' ? 'Chippi' : 'You',
    rows: workbook.rows.map((row, rowIndex) => Object.fromEntries([['id', String(rowIndex)], ...row.map((cell, index) => [`c${index}`, cell])]) as WorkbenchRow),
    receipt: isTransformationReceipt(version.transformReceipt) ? version.transformReceipt : undefined,
  };
}

function WorkbenchEditor({ artifact, versions: initialVersions, sourceWorkbook, history = [], historyIncomplete = false, loadVersion, className, persist = false }: { artifact: WorkbenchArtifact; versions?: WorkbenchVersion[]; sourceWorkbook?: StoredWorkbook; history?: PersistedVersionMeta[]; historyIncomplete?: boolean; loadVersion?: (versionNumber: number) => Promise<WorkbenchVersion>; className?: string; persist?: boolean }) {
  const [versions, setVersions] = useState<WorkbenchVersion[]>(initialVersions ?? [artifact.sourceVersion]);
  const [selectedVersionId, setSelectedVersionId] = useState(artifact.sourceVersion.id);
  const [rows, setRows] = useState(() => snapshotRows(artifact.sourceVersion.rows));
  const [storageReady, setStorageReady] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const saveInFlight = useRef(false);

  useEffect(() => {
    const loaded = initialVersions ?? readStoredVersions(artifact);
    const latest = loaded.at(-1) ?? artifact.sourceVersion;
    setVersions(loaded);
    setSelectedVersionId(latest.id);
    setRows(snapshotRows(latest.rows));
    setStorageReady(true);
    setSaveState('idle');
  }, [artifact, initialVersions]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions.at(-1) ?? artifact.sourceVersion,
    [artifact.sourceVersion, selectedVersionId, versions],
  );
  const versionOptions = useMemo(
    () => mergeWorkbenchVersionOptions(history, versions),
    [history, versions],
  );
  const savePreview = useMemo(
    () => saveWorkbookVersion({ artifactId: artifact.id, sourceVersion: selectedVersion, rows, columns: artifact.columns, now: new Date(0) }),
    [artifact.columns, artifact.id, rows, selectedVersion],
  );
  const hasChanges = savePreview !== null;

  const selectVersion = async (id: string) => {
    const next = versions.find((version) => version.id === id);
    if (next) {
      setSelectedVersionId(next.id);
      setRows(snapshotRows(next.rows));
      return;
    }
    const metadata = history.find((version) => version.id === id);
    if (!metadata || !loadVersion) return;
    try {
      const loaded = await loadVersion(metadata.versionNumber);
      setVersions((existing) => [...existing.filter((version) => version.id !== loaded.id), loaded].sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber)));
      setSelectedVersionId(loaded.id);
      setRows(snapshotRows(loaded.rows));
    } catch {
      setSaveState('error');
    }
  };

  const saveVersion = async () => {
    if (saveInFlight.current || saveState === 'saving') return;
    const next = saveWorkbookVersion({
      artifactId: artifact.id,
      sourceVersion: selectedVersion,
      rows,
      columns: artifact.columns,
      now: new Date(),
      versionNumber: nextWorkbookVersionNumber(versions),
    });
    if (!next) return;
    if (persist) {
      const workbook = sourceWorkbook ?? { kind: 'chippi.workbook.v1' as const, sourceAttachmentId: '', sourceFilename: artifact.title, sheetName: 'Sheet1', columns: artifact.columns.map((column) => column.label), rows: [] };
      const content = stringifyWorkbook({ ...workbook, columns: artifact.columns.map((column) => column.label), rows: next.rows.map((row) => artifact.columns.map((column) => String(row[column.key] ?? ''))), });
      try {
        saveInFlight.current = true;
        setSaveState('saving');
        const response = await fetch(`/api/agent/artifacts/${encodeURIComponent(artifact.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, metadata: { kind: 'chippi.workbook.v1' } }) });
        if (!response.ok) throw new Error('save failed');
        const payload = await response.json() as {
          artifact?: {
            newVersion?: {
              id?: unknown;
              versionNumber?: unknown;
              createdAt?: unknown;
            };
          };
        };
        const persisted = payload.artifact?.newVersion;
        if (
          !persisted
          || typeof persisted.id !== 'string'
          || typeof persisted.versionNumber !== 'number'
          || typeof persisted.createdAt !== 'string'
        ) {
          throw new Error('save returned an invalid version');
        }
        next.id = persisted.id;
        next.versionNumber = persisted.versionNumber;
        next.label = `Version ${persisted.versionNumber}`;
        next.createdAt = persisted.createdAt;
      } catch {
        saveInFlight.current = false;
        setSaveState('error');
        return;
      }
    }
    const nextVersions = [...versions, next];
    setVersions(nextVersions);
    setSelectedVersionId(next.id);
    setRows(snapshotRows(next.rows));
    if (!persist && storageReady) persistVersions(artifact, nextVersions);
    setSaveState('idle');
    saveInFlight.current = false;
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-background', className)}>
      <div className="border-b border-border/60 px-4 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/35">
                <FileSpreadsheet className="size-3.5 text-foreground/75" />
              </div>
              <h2 className="truncate text-sm font-semibold tracking-tight">{artifact.title}</h2>
            </div>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">{artifact.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={saveVersion}
            disabled={!hasChanges || saveState === 'saving'}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
              hasChanges && saveState !== 'saving'
                ? 'bg-foreground text-background shadow-sm hover:bg-foreground/85'
                : 'cursor-not-allowed border border-border/55 bg-muted/30 text-muted-foreground/55',
            )}
          >
            <Save className="size-3.5" />
            {saveState === 'saving' ? 'Saving…' : 'Save version'}
          </button>
        </div>
        {saveState === 'error' && <p role="alert" className="mt-2 text-xs text-destructive">Couldn’t save this version. Your edit is still here; try again.</p>}

        <div className="mt-3 flex items-center gap-2">
          <History className="size-3.5 shrink-0 text-muted-foreground" />
          <label className="sr-only" htmlFor={`workbench-version-${artifact.id}`}>Version</label>
          <div className="relative min-w-0 flex-1">
            <select
              id={`workbench-version-${artifact.id}`}
              value={selectedVersion.id}
              onChange={(event) => selectVersion(event.target.value)}
              className="h-8 w-full appearance-none rounded-lg border border-border/60 bg-background py-0 pl-2.5 pr-8 text-[11px] font-medium text-foreground outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              {versionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.author}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          {persist && (
            <a
              href={`/api/agent/artifacts/${encodeURIComponent(artifact.id)}/download?version=${encodeURIComponent(String(selectedVersion.versionNumber ?? (Number(selectedVersion.label.replace(/\D/g, '')) || 1)))}`}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 text-[11px] font-medium text-foreground hover:bg-muted/35"
            >
              <Download className="size-3.5" /> Export
            </a>
          )}
        </div>
        {persist && historyIncomplete && <p className="mt-2 text-[11px] text-muted-foreground">Showing the newest 20 versions. Older versions are not loaded in this view.</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <p className="mb-2 text-[11px] text-muted-foreground sm:hidden">Swipe the table horizontally to edit every column.</p>
        <div role="region" aria-label="Scrollable spreadsheet table" tabIndex={0} className="min-w-[37rem] overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_2px_rgb(0_0_0_/_0.025)]">
          <table
            aria-label={`${artifact.title} spreadsheet`}
            className="w-full border-collapse text-left"
          >
            <thead className="bg-muted/[0.38]">
              <tr>
                {artifact.columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      'border-b border-border/60 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground',
                      column.align === 'right' && 'text-right',
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={String(row.id)} className="group transition-colors hover:bg-muted/[0.18]">
                  {artifact.columns.map((column) => {
                    const value = row[column.key] ?? '';
                    return (
                      <td key={column.key} className="border-b border-border/45 p-0 last:border-r-0">
                        <label className="sr-only" htmlFor={`${artifact.id}-${row.id}-${column.key}`}>
                          {column.label} for row {rowIndex + 1}
                        </label>
                        <input
                          id={`${artifact.id}-${row.id}-${column.key}`}
                          value={value}
                          onChange={(event) => setRows((previous) => updateWorkbookCell(previous, String(row.id), column.key, event.target.value))}
                          className={cn(
                            'h-10 w-full bg-transparent px-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:bg-foreground/[0.035] focus:ring-1 focus:ring-inset focus:ring-foreground/20',
                            column.align === 'right' && 'text-right tabular-nums',
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedVersion.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16 }}
          >
            <Receipt version={selectedVersion} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
