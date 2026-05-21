'use client';

/**
 * FilesPanel — a Drive-style file browser for /s/[slug]/files.
 *
 *   - Folders you navigate (click to open, breadcrumb to climb out)
 *   - Image thumbnails + an in-place preview modal
 *   - Drag a file card onto a folder (or a breadcrumb) to move it
 *   - Inline rename for files and folders
 *   - Desktop drag-drop upload into the current folder
 *
 * All state lives here; cards + modal are presentational. Server-side
 * limits + quota enforcement stay in /api/files.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Upload,
  Loader2,
  AlertCircle,
  FolderPlus,
  Home,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, type FileCategory } from '@/lib/storage/limits';
import { FileCard } from '@/components/files/file-card';
import { FolderCard } from '@/components/files/folder-card';
import { FilePreviewModal } from '@/components/files/file-preview-modal';
import { FILE_DRAG_TYPE, type FileRow, type FolderRow } from '@/components/files/types';

interface Quota {
  planId: string;
  totalBytes: number;
  usedBytes: number;
  remainingBytes: number;
  label: string;
}

type Tab = 'all' | FileCategory;

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'all', label: 'All', icon: FileText },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
];

export function FilesPanel() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch(`/api/files?folderId=${currentFolderId ?? 'root'}`),
        fetch('/api/folders'),
      ]);
      if (!filesRes.ok) throw new Error('Failed to load files');
      const filesData = await filesRes.json();
      setFiles(filesData.files ?? []);
      setQuota(filesData.quota ?? null);
      if (foldersRes.ok) {
        const foldersData = await foldersRes.json();
        setFolders(foldersData.folders ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (incoming: File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const f of incoming) {
          const form = new FormData();
          form.append('file', f);
          if (currentFolderId) form.append('folderId', currentFolderId);
          // eslint-disable-next-line no-await-in-loop
          const res = await fetch('/api/files', { method: 'POST', body: form });
          if (!res.ok) {
            // eslint-disable-next-line no-await-in-loop
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || 'Upload failed');
          }
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [currentFolderId, refresh],
  );

  // ── File actions ────────────────────────────────────────────────────────────
  const onDelete = useCallback(
    async (file: FileRow) => {
      const endpoint =
        file.source === 'chat'
          ? `/api/ai/attachments?id=${encodeURIComponent(file.id)}`
          : `/api/files/${file.id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) await refresh();
    },
    [refresh],
  );

  const onDownload = useCallback(async (file: FileRow) => {
    const endpoint =
      file.source === 'chat'
        ? `/api/ai/attachments?id=${encodeURIComponent(file.id)}`
        : `/api/files/${file.id}`;
    const res = await fetch(endpoint);
    if (!res.ok) return;
    const body = (await res.json()) as { url?: string; publicUrl?: string };
    const url = body.url ?? body.publicUrl;
    if (url) window.open(url, '_blank', 'noopener');
  }, []);

  const onRenameFile = useCallback(
    async (file: FileRow, name: string) => {
      const res = await fetch(`/api/files/${file.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await refresh();
      else setError('Could not rename that file.');
    },
    [refresh],
  );

  const onMoveFile = useCallback(
    async (fileId: string, folderId: string | null) => {
      const res = await fetch(`/api/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId ?? 'root' }),
      });
      if (res.ok) await refresh();
      else setError('Could not move that file.');
    },
    [refresh],
  );

  // ── Folder actions ──────────────────────────────────────────────────────────
  const createFolder = useCallback(async () => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled folder', parentId: currentFolderId ?? 'root' }),
    });
    if (res.ok) {
      const created = (await res.json()) as { id: string };
      setNewFolderId(created.id);
      await refresh();
    } else {
      setError('Could not create the folder.');
    }
  }, [currentFolderId, refresh]);

  const onRenameFolder = useCallback(
    async (folder: FolderRow, name: string) => {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await refresh();
      else setError('Could not rename that folder.');
    },
    [refresh],
  );

  const onDeleteFolder = useCallback(
    async (folder: FolderRow) => {
      const res = await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' });
      if (res.ok) await refresh();
      else setError('Could not delete that folder.');
    },
    [refresh],
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const subfolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === currentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId],
  );

  // [outermost ancestor, …, current folder] — built by walking up parentId.
  const breadcrumb = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const trail: FolderRow[] = [];
    const seen = new Set<string>();
    let cursor = currentFolderId;
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      const f = byId.get(cursor);
      if (!f) break;
      trail.unshift(f);
      cursor = f.parentId;
    }
    return trail;
  }, [folders, currentFolderId]);

  const visibleFiles = useMemo(
    () => (tab === 'all' ? files : files.filter((f) => f.category === tab)),
    [files, tab],
  );

  const usedPercent = useMemo(() => {
    if (!quota || quota.totalBytes === 0) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100));
  }, [quota]);

  const isEmpty = !loading && subfolders.length === 0 && visibleFiles.length === 0;

  return (
    <div
      className="space-y-5"
      onDragOver={(e) => {
        // Only a desktop-file drag raises the upload overlay — an in-page
        // card drag carries our own type and must not trigger it.
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        setDragActive(false);
        const dropped = Array.from(e.dataTransfer.files ?? []);
        if (dropped.length > 0) {
          e.preventDefault();
          void handleFiles(dropped);
        }
      }}
    >
      {/* Quota gauge */}
      {quota && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatBytes(quota.usedBytes)} of {quota.label} used
            </span>
            <span
              className={cn(
                'font-medium tabular-nums',
                usedPercent >= 90
                  ? 'text-rose-600 dark:text-rose-400'
                  : usedPercent >= 70
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-foreground',
              )}
            >
              {usedPercent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all',
                usedPercent >= 90
                  ? 'bg-rose-500/80'
                  : usedPercent >= 70
                    ? 'bg-amber-500/80'
                    : 'bg-emerald-500/80',
              )}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <Crumb
          label={<Home size={13} />}
          active={currentFolderId === null}
          onClick={() => setCurrentFolderId(null)}
          onDropFile={(fid) => void onMoveFile(fid, null)}
        />
        {breadcrumb.map((f, i) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight size={13} className="text-muted-foreground/50" />
            <Crumb
              label={f.name}
              active={i === breadcrumb.length - 1}
              onClick={() => setCurrentFolderId(f.id)}
              onDropFile={(fid) => void onMoveFile(fid, f.id)}
            />
          </span>
        ))}
      </div>

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void createFolder()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-3.5 text-[13px] font-medium text-foreground hover:bg-muted/40"
          >
            <FolderPlus size={13} />
            New folder
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) void handleFiles(picked);
            e.target.value = '';
          }}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-50/70 px-3 py-2 text-[12.5px] text-rose-700 dark:bg-rose-500/5 dark:text-rose-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-rose-700/70 hover:text-rose-700 dark:text-rose-400/70 dark:hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drop-to-upload overlay */}
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-foreground/5 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-foreground/40 bg-background px-8 py-6 text-center">
            <Upload className="mx-auto h-8 w-8 text-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : isEmpty ? (
        <EmptyState onPick={() => inputRef.current?.click()} />
      ) : (
        <div className="space-y-6">
          {subfolders.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Folders</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {subfolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    startRenaming={folder.id === newFolderId}
                    onOpen={(f) => setCurrentFolderId(f.id)}
                    onRename={onRenameFolder}
                    onDelete={onDeleteFolder}
                    onMoveFileIn={(fid, folderId) => void onMoveFile(fid, folderId)}
                  />
                ))}
              </div>
            </section>
          )}
          {visibleFiles.length > 0 && (
            <section className="space-y-2">
              {subfolders.length > 0 && <SectionLabel>Files</SectionLabel>}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {visibleFiles.map((file) => (
                  <FileCard
                    key={`${file.source}:${file.id}`}
                    file={file}
                    onPreview={setPreview}
                    onDownload={onDownload}
                    onDelete={onDelete}
                    onRename={onRenameFile}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {preview && (
        <FilePreviewModal
          file={preview}
          onClose={() => setPreview(null)}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/** A breadcrumb segment — also a drop target, so a file can be dragged up. */
function Crumb({
  label,
  active,
  onClick,
  onDropFile,
}: {
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onDropFile: (fileId: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FILE_DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const fid = e.dataTransfer.getData(FILE_DRAG_TYPE);
        if (fid) {
          e.preventDefault();
          onDropFile(fid);
        }
      }}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded px-1.5 transition-colors',
        over && 'bg-foreground/10 ring-1 ring-foreground/30',
        active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border/60 bg-card px-6 py-12 text-center transition-colors hover:border-border hover:bg-muted/20"
    >
      <Upload className="h-7 w-7 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium text-foreground">This folder is empty</p>
      <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">
        Drop files here or use Upload. Make folders to keep things organized.
      </p>
    </button>
  );
}
