'use client';

import { useEffect, useState } from 'react';
import { X, Download, Trash2, Loader2, FileText } from 'lucide-react';
import type { FileRow } from './types';

interface Props {
  file: FileRow;
  onClose: () => void;
  onDownload: (file: FileRow) => void;
  onDelete: (file: FileRow) => void;
}

/** In-place preview — image, PDF, video, audio, or text rendered inline,
 *  with a download/delete fallback for anything that can't be shown. */
export function FilePreviewModal({ file, onClose, onDownload, onDelete }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setUrl(null);
    setText(null);
    void (async () => {
      try {
        const endpoint =
          file.source === 'chat'
            ? `/api/ai/attachments?id=${encodeURIComponent(file.id)}`
            : `/api/files/${file.id}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('fetch failed');
        const body = (await res.json()) as { url?: string; publicUrl?: string };
        const resolved = body.url ?? body.publicUrl;
        if (!resolved) throw new Error('no url');
        if (cancelled) return;
        setUrl(resolved);
        if (file.mimeType.startsWith('text/')) {
          const textRes = await fetch(resolved);
          if (!cancelled) setText(textRes.ok ? await textRes.text() : '');
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</p>
          <button
            type="button"
            onClick={() => onDownload(file)}
            title="Download"
            className="text-foreground/60 hover:text-foreground"
          >
            <Download size={15} />
          </button>
          {file.source === 'file' && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${file.name}"?`)) {
                  onDelete(file);
                  onClose();
                }
              }}
              title="Delete"
              className="text-rose-600 hover:opacity-80 dark:text-rose-400"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="text-foreground/60 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-muted/20">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : error || !url ? (
            <PreviewFallback />
          ) : file.mimeType.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-h-[78vh] max-w-full object-contain" />
          ) : file.mimeType === 'application/pdf' ? (
            <iframe src={url} title={file.name} className="h-[78vh] w-full" />
          ) : file.mimeType.startsWith('video/') ? (
            <video src={url} controls className="max-h-[78vh] max-w-full" />
          ) : file.mimeType.startsWith('audio/') ? (
            <audio src={url} controls className="w-full max-w-md" />
          ) : file.mimeType.startsWith('text/') ? (
            <pre className="h-full w-full overflow-auto whitespace-pre-wrap p-4 text-[12px] leading-relaxed">
              {text}
            </pre>
          ) : (
            <PreviewFallback />
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewFallback() {
  return (
    <div className="p-10 text-center">
      <FileText className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">No preview for this file type.</p>
      <p className="text-[12px] text-muted-foreground/70">Use Download to open it.</p>
    </div>
  );
}
