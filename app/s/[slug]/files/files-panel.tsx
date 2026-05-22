'use client';

/**
 * FilesPanel — the interactive surface of /s/[slug]/files. Renders:
 *
 *   1. A quota gauge (used vs. plan total)
 *   2. Category tabs (All / Images / Documents / Videos / Audio)
 *   3. A drag-drop dropzone + file picker
 *   4. A grid of file cards (image thumbnails when isPublic; icon + name
 *      otherwise — private files use a signed-URL fetch on Download click)
 *
 * Limits + quota enforcement live server-side in /api/files. The UI
 * mirrors the cap labels client-side as a courtesy ("Max 25 MB for PDFs")
 * but never trusts them as the source of truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Upload,
  Trash2,
  Download,
  Loader2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, type FileCategory } from '@/lib/storage/limits';

interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  category: FileCategory;
  sizeBytes: number;
  isPublic: boolean;
  createdAt: string;
  /** Signed (File) or public (chat attachment) URL — drives the grid
   *  thumbnail and the preview viewer. Null when no URL is available. */
  url?: string | null;
  /** Where the file came from. 'chat' rows are read-only here; manage them
   *  by removing the attachment inside the Chippi conversation. */
  source: 'file' | 'chat';
}

interface Quota {
  planId: string;
  totalBytes: number;
  usedBytes: number;
  remainingBytes: number;
  label: string;
}

type Tab = 'all' | FileCategory;

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'all', label: 'All', icon: FileText },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'document', label: 'Documents', icon: FileText },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'audio', label: 'Audio', icon: Music },
];

const CATEGORY_ICON: Record<FileCategory, React.ComponentType<{ size?: number; className?: string }>> = {
  image: ImageIcon,
  document: FileText,
  video: Film,
  audio: Music,
  other: FileText,
};

export function FilesPanel() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error('Failed to load files');
      const data = await res.json();
      setFiles(data.files ?? []);
      setQuota(data.quota ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadOne = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/files', { method: 'POST', body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Upload failed');
      }
    },
    [],
  );

  const handleFiles = useCallback(
    async (incoming: File[]) => {
      setUploading(true);
      setError(null);
      try {
        for (const f of incoming) {
          // eslint-disable-next-line no-await-in-loop
          await uploadOne(f);
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [uploadOne, refresh],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (dropped.length > 0) void handleFiles(dropped);
    },
    [handleFiles],
  );

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
    // Chat attachments are already public — fetch the row to get the URL.
    // Files use a signed-URL endpoint that returns a 5-min download link.
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

  const visibleFiles = useMemo(() => {
    if (tab === 'all') return files;
    return files.filter((f) => f.category === tab);
  }, [files, tab]);

  const usedPercent = useMemo(() => {
    if (!quota || quota.totalBytes === 0) return 0;
    return Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100));
  }, [quota]);

  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const showPrev = useCallback(
    () => setPreviewIndex((i) => (i === null ? i : i - 1)),
    [],
  );
  const showNext = useCallback(
    () => setPreviewIndex((i) => (i === null ? i : i + 1)),
    [],
  );

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={onDrop}
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
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
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

      {/* Tabs + Upload button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
                  'inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-[12.5px] font-medium transition-colors',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 h-9 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Upload
        </button>
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
        <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-rose-700/70 dark:text-rose-400/70 hover:text-rose-700 dark:hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Drop overlay */}
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-50 bg-foreground/5 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-xl border-2 border-dashed border-foreground/40 bg-background px-8 py-6 text-center">
            <Upload className="w-8 h-8 mx-auto text-foreground/60" />
            <p className="mt-2 text-sm font-medium text-foreground">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : visibleFiles.length === 0 ? (
        <EmptyState onPick={() => inputRef.current?.click()} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visibleFiles.map((file, i) => (
            <FileCard
              key={file.id}
              file={file}
              onOpen={() => setPreviewIndex(i)}
              onDelete={onDelete}
              onDownload={onDownload}
            />
          ))}
        </div>
      )}

      {previewIndex !== null && visibleFiles[previewIndex] && (
        <FilePreview
          file={visibleFiles[previewIndex]}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < visibleFiles.length - 1}
          onPrev={showPrev}
          onNext={showNext}
          onClose={closePreview}
          onDownload={onDownload}
          onDelete={(f) => {
            closePreview();
            onDelete(f);
          }}
        />
      )}
    </div>
  );
}

function FileCard({
  file,
  onOpen,
  onDelete,
  onDownload,
}: {
  file: FileRow;
  onOpen: () => void;
  onDelete: (file: FileRow) => void;
  onDownload: (file: FileRow) => void;
}) {
  const Icon = CATEGORY_ICON[file.category];
  const [thumbFailed, setThumbFailed] = useState(false);
  const showImage = file.category === 'image' && !!file.url && !thumbFailed;
  const showVideo = file.category === 'video' && !!file.url && !thumbFailed;

  return (
    <div className="group relative rounded-xl border border-border/60 bg-card overflow-hidden hover:border-border transition-colors">
      <button
        type="button"
        onClick={onOpen}
        title={`Open ${file.name}`}
        className="block w-full text-left"
      >
        <div className="relative aspect-square bg-muted/30 flex items-center justify-center">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url as string}
              alt={file.name}
              loading="lazy"
              onError={() => setThumbFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : showVideo ? (
            <>
              <video
                src={`${file.url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                onError={() => setThumbFailed(true)}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm">
                  <Play size={14} className="translate-x-px text-foreground" fill="currentColor" />
                </span>
              </span>
            </>
          ) : (
            <Icon className="w-8 h-8 text-muted-foreground/60" />
          )}
        </div>
        <div className="p-2.5 space-y-0.5">
          <p className="text-[12px] font-medium text-foreground truncate" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10.5px] text-muted-foreground tabular-nums">
              {formatBytes(file.sizeBytes)}
            </p>
            {file.source === 'chat' && (
              <span
                title="Uploaded inside a Chippi conversation"
                className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-px rounded-full bg-foreground/[0.06] text-foreground/55"
              >
                Chat
              </span>
            )}
          </div>
        </div>
      </button>
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onDownload(file)}
          title="Download"
          className="w-7 h-7 rounded-md bg-background/90 backdrop-blur-sm text-foreground/70 hover:text-foreground flex items-center justify-center border border-border/60"
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${file.name}"?`)) onDelete(file);
          }}
          title="Delete"
          className="w-7 h-7 rounded-md bg-background/90 backdrop-blur-sm text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 flex items-center justify-center border border-rose-500/30"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full rounded-xl border-2 border-dashed border-border/60 bg-card hover:bg-muted/20 hover:border-border transition-colors py-12 px-6 flex flex-col items-center text-center"
    >
      <Upload className="w-7 h-7 text-muted-foreground/60" />
      <p className="mt-3 text-sm font-medium text-foreground">Drop files here</p>
      <p className="mt-1 text-[12px] text-muted-foreground max-w-sm">
        Images, PDFs, videos, audio — up to 10 MB images / 25 MB PDFs / 200 MB videos / 50 MB audio.
      </p>
    </button>
  );
}

/**
 * FilePreview — a full-screen viewer for one file. Images render inline,
 * video and audio get native players, PDFs embed in an iframe; anything
 * else falls back to a download prompt. Escape closes, arrow keys page
 * through the surrounding grid.
 */
function FilePreview({
  file,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onDownload,
  onDelete,
}: {
  file: FileRow;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = CATEGORY_ICON[file.category];
  const isPdf = file.mimeType === 'application/pdf';

  // Clear the load-error state whenever the previewed file changes.
  useEffect(() => {
    setFailed(false);
  }, [file.id]);

  // Lock body scroll for the lifetime of the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes; arrows page through the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      else if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8"
    >
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          title="Previous"
          className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          title="Next"
          className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-4xl max-h-[88vh] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Icon size={16} className="flex-shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={file.name}>
              {file.name}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {formatBytes(file.sizeBytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDownload(file)}
            title="Download"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete "${file.name}"?`)) onDelete(file);
            }}
            title="Delete"
            className="flex h-8 w-8 items-center justify-center rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20">
          {!file.url || failed ? (
            <PreviewFallback
              Icon={Icon}
              note={
                failed
                  ? 'This preview could not be loaded. Try refreshing the page.'
                  : 'No preview is available for this file.'
              }
              onDownload={() => onDownload(file)}
            />
          ) : file.category === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file.url}
              alt={file.name}
              onError={() => setFailed(true)}
              className="max-h-[78vh] max-w-full w-auto object-contain"
            />
          ) : file.category === 'video' ? (
            <video
              src={file.url}
              controls
              playsInline
              onError={() => setFailed(true)}
              className="max-h-[78vh] max-w-full"
            />
          ) : file.category === 'audio' ? (
            <div className="flex flex-col items-center gap-5 px-6 py-20">
              <Icon size={40} className="text-muted-foreground/50" />
              <audio src={file.url} controls onError={() => setFailed(true)} />
            </div>
          ) : isPdf ? (
            <iframe src={file.url} title={file.name} className="h-[78vh] w-full bg-white" />
          ) : (
            <PreviewFallback
              Icon={Icon}
              note="This file type can't be previewed here. Download it to view."
              onDownload={() => onDownload(file)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewFallback({
  Icon,
  note,
  onDownload,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  note: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <Icon size={44} className="text-muted-foreground/50" />
      <p className="max-w-xs text-sm text-muted-foreground">{note}</p>
      <button
        type="button"
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-[13px] font-semibold text-background hover:opacity-90 transition-opacity"
      >
        <Download size={13} />
        Download
      </button>
    </div>
  );
}
