'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AttachmentBlock } from '@/lib/ai-tools/blocks';

/**
 * Renders a file the realtor attached to a message — an image thumbnail or a
 * document chip. Matches the composer's attachment chips so a sent file looks
 * the same in history as it did before sending.
 *
 * Images lazy-load a short-lived signed URL from /api/ai/attachments/[id]
 * (the persisted block never stores a URL — those expire). An optimistic block
 * coming straight from the composer can pass a `localUrl` (an object URL) so
 * the thumbnail shows instantly without a round-trip.
 */
export function AttachmentBlockView({
  block,
  localUrl,
}: {
  block: AttachmentBlock;
  /** Object URL from the composer for instant optimistic display. */
  localUrl?: string;
}) {
  const [src, setSrc] = useState<string | null>(localUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Already have a URL (optimistic object URL) or not an image → nothing to
    // fetch. Documents render as a chip with no preview.
    if (src || !block.isImage) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/attachments/${encodeURIComponent(block.id)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { url?: string };
        if (!cancelled && data.url) setSrc(data.url);
        else if (!cancelled) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [block.id, block.isImage, src]);

  if (block.isImage) {
    return (
      <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/60 bg-foreground/[0.03]">
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={block.filename}
            className="w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : failed ? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <FileText size={18} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 h-12 pl-2 pr-3 rounded-lg border border-border/60',
        'bg-foreground/[0.04]',
      )}
      title={block.filename}
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-background/70 text-muted-foreground flex-shrink-0">
        <FileText size={13} />
      </span>
      <span className="truncate max-w-[180px] text-[12px] font-medium text-foreground leading-tight">
        {block.filename.length > 28 ? `${block.filename.slice(0, 28)}…` : block.filename}
      </span>
    </div>
  );
}
