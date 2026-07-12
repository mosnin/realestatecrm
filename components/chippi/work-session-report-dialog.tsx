'use client';

/**
 * WorkSessionReportDialog — the deliverable rendered as markdown right where
 * the realtor is (session strip card or the Sessions history page), with
 * download as the secondary path. Fetched lazily on first open (?raw=1
 * returns the markdown body).
 */

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Markdown } from '@/components/ai/prompt-kit';

export function WorkSessionReportDialog({
  open, onOpenChange, sessionId, slug, name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  slug: string;
  name: string | null;
}) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || markdown !== null) return;
    let stale = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/work-sessions/${sessionId}/artifact?slug=${encodeURIComponent(slug)}&raw=1`,
        );
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { markdown?: string };
        if (!stale) setMarkdown(json.markdown ?? '');
      } catch {
        if (!stale) setFailed(true);
      }
    })();
    return () => {
      stale = true;
    };
  }, [open, markdown, sessionId, slug]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6 text-[15px]">
            <span className="truncate">{name ?? 'Work session report'}</span>
            <a
              href={`/api/work-sessions/${sessionId}/artifact?slug=${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] font-normal text-muted-foreground hover:text-foreground"
            >
              <Download size={12} />
              Download
            </a>
          </DialogTitle>
        </DialogHeader>
        {failed ? (
          <p className="text-[13px] text-destructive">Couldn&apos;t load the report — try the download instead.</p>
        ) : markdown === null ? (
          <div className="flex justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-[13px]">
            <Markdown>{markdown}</Markdown>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
