'use client';

import { useState, useEffect } from 'react';
import { KanbanBoard } from './kanban-board';
import { PipelineSummary } from './pipeline-summary';
import { cn } from '@/lib/utils';

export function DealsPageClient({ slug }: { slug: string }) {
  const [pipelineType, setPipelineType] = useState<'rental' | 'buyer'>('rental');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !slug) {
      setHydrated(true);
      return;
    }
    try {
      const stored = localStorage.getItem(`chippi:deals:pipeline:${slug}`);
      if (stored === 'rental' || stored === 'buyer') setPipelineType(stored);
    } catch {
      // localStorage unavailable (Safari private mode, disabled, etc.) — ignore.
    }
    setHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined' || !slug || !hydrated) return;
    try {
      localStorage.setItem(`chippi:deals:pipeline:${slug}`, pipelineType);
    } catch {
      // quota exceeded / storage disabled — ignore.
    }
  }, [slug, pipelineType, hydrated]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track your rental and buyer pipeline from lead to close
        </p>
      </div>

      {/* Pipeline toggle */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setPipelineType('rental')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            pipelineType === 'rental'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Rental Pipeline
        </button>
        <button
          onClick={() => setPipelineType('buyer')}
          className={cn(
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            pipelineType === 'buyer'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Buyer Pipeline
        </button>
      </div>

      <PipelineSummary slug={slug} pipelineType={pipelineType} />

      <KanbanBoard slug={slug} pipelineType={pipelineType} />
    </div>
  );
}
