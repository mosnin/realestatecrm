'use client';

/**
 * PropertyGallery — the detail page's cinematic header image.
 *
 * Real estate leads with the photo. The old hero showed only `photos[0]`;
 * this shows the whole set: a large 16:9 stage plus a thumbnail rail the
 * realtor can click to swap the stage. Same data (`property.photos`), no
 * fetching, no route change — purely a richer presentation of what's already
 * on file. When there are no photos, the same calm 16:9 placeholder.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';

export function PropertyGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safeActive = Math.min(active, Math.max(0, photos.length - 1));
  const current = photos[safeActive];

  if (photos.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/20">
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Building2 size={28} className="text-muted-foreground/50" aria-hidden />
          <p className="text-xs text-muted-foreground">No photo on file yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {/* Stage — the active photo. Cross-fades on swap; entrance is a tiny
          1.02 → 1 settle so the photo lands rather than zooms. */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-muted">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={current}
            src={current}
            alt={alt}
            className="aspect-video w-full object-cover"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE_APPLE }}
          />
        </AnimatePresence>
      </div>

      {/* Thumbnail rail — only when there's more than one photo. The active
          tile carries a foreground ring; the rest are quiet until hovered. */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => {
            const isActive = i === safeActive;
            return (
              <button
                key={url}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={isActive}
                className={cn(
                  'relative aspect-[4/3] w-20 flex-shrink-0 overflow-hidden rounded-md bg-muted',
                  'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  isActive
                    ? 'ring-2 ring-foreground'
                    : 'opacity-70 ring-1 ring-border/60 hover:opacity-100',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
