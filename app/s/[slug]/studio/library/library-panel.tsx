'use client';

/**
 * LibraryPanel — /s/[slug]/studio/library. A gallery of the realtor's past
 * Studio generations, newest first.
 */

import { useEffect, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { BODY_MUTED, CAPTION } from '@/lib/typography';

interface LibraryItem {
  id: string;
  kind: string;
  model: string;
  prompt: string;
  createdAt: string;
  url: string | null;
}

export function LibraryPanel() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/studio/library');
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as { items?: LibraryItem[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setError('Could not load your library.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className={cn(BODY_MUTED, 'py-12 text-center')}>Loading…</p>;
  }
  if (error) {
    return (
      <p className="py-12 text-center text-[12.5px] text-rose-700 dark:text-rose-400">
        {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ImagePlus}
        title="Nothing in your library yet."
        description="Images and video you generate in Studio collect here."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-border/60 bg-card overflow-hidden"
        >
          <div className="aspect-square bg-muted/30">
            {item.url ? (
              item.kind === 'video' ? (
                <video src={item.url} controls className="w-full h-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.prompt || 'Generated asset'}
                  className="w-full h-full object-cover"
                />
              )
            ) : null}
          </div>
          {item.prompt && (
            <p className={cn(CAPTION, 'px-2.5 py-2 line-clamp-2')} title={item.prompt}>
              {item.prompt}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
