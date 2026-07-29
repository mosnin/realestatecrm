'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, FileSpreadsheet, History, RotateCcw, Save, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  nextWorkbookVersionNumber,
  reconcileWorkbookVersions,
  saveWorkbookVersion,
  snapshotRows,
  updateWorkbookCell,
  type WorkbenchArtifact,
  type WorkbenchCellValue,
  type WorkbenchVersion,
} from '@/lib/chippi/workbench';

const STORAGE_PREFIX = 'chippi:workbench:v1:';

type WorkbenchState = 'ready' | 'empty' | 'error';

interface LiveWorkbenchProps {
  artifact?: WorkbenchArtifact;
  state?: WorkbenchState;
  className?: string;
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

function Receipt({ version }: { version: WorkbenchVersion }) {
  if (!version.receipt) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-foreground/65" />
        <span>Source snapshot created by Chippi. Your edits are saved as a new version.</span>
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
 * A feature-off local work surface. The artifact begins as an immutable
 * snapshot, edits stay in the browser in this slice, and each save appends a
 * distinct version. There is deliberately no customer data mutation here.
 */
export function LiveWorkbench({ artifact, state = 'ready', className }: LiveWorkbenchProps) {
  if (state === 'empty') return <EmptyState />;
  if (state === 'error') return <ErrorState />;
  if (!artifact) return <EmptyState />;

  return <WorkbenchEditor artifact={artifact} className={className} />;
}

function WorkbenchEditor({ artifact, className }: { artifact: WorkbenchArtifact; className?: string }) {
  const [versions, setVersions] = useState<WorkbenchVersion[]>([artifact.sourceVersion]);
  const [selectedVersionId, setSelectedVersionId] = useState(artifact.sourceVersion.id);
  const [rows, setRows] = useState(() => snapshotRows(artifact.sourceVersion.rows));
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const loaded = readStoredVersions(artifact);
    const latest = loaded.at(-1) ?? artifact.sourceVersion;
    setVersions(loaded);
    setSelectedVersionId(latest.id);
    setRows(snapshotRows(latest.rows));
    setStorageReady(true);
  }, [artifact]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions.at(-1) ?? artifact.sourceVersion,
    [artifact.sourceVersion, selectedVersionId, versions],
  );
  const savePreview = useMemo(
    () => saveWorkbookVersion({ artifactId: artifact.id, sourceVersion: selectedVersion, rows, columns: artifact.columns, now: new Date(0) }),
    [artifact.columns, artifact.id, rows, selectedVersion],
  );
  const hasChanges = savePreview !== null;

  const selectVersion = (id: string) => {
    const next = versions.find((version) => version.id === id);
    if (!next) return;
    setSelectedVersionId(next.id);
    setRows(snapshotRows(next.rows));
  };

  const saveVersion = () => {
    const next = saveWorkbookVersion({
      artifactId: artifact.id,
      sourceVersion: selectedVersion,
      rows,
      columns: artifact.columns,
      now: new Date(),
      versionNumber: nextWorkbookVersionNumber(versions),
    });
    if (!next) return;
    const nextVersions = [...versions, next];
    setVersions(nextVersions);
    setSelectedVersionId(next.id);
    setRows(snapshotRows(next.rows));
    if (storageReady) persistVersions(artifact, nextVersions);
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
            disabled={!hasChanges}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors',
              hasChanges
                ? 'bg-foreground text-background shadow-sm hover:bg-foreground/85'
                : 'cursor-not-allowed border border-border/55 bg-muted/30 text-muted-foreground/55',
            )}
          >
            <Save className="size-3.5" />
            Save version
          </button>
        </div>

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
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.author}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <div className="min-w-[37rem] overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_2px_rgb(0_0_0_/_0.025)]">
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
