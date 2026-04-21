'use client';

import { useState, useEffect } from 'react';
import { KanbanBoard } from './kanban-board';
import { PipelineSummary } from './pipeline-summary';
import { PipelineTabs } from './pipeline-tabs';
import type { Pipeline } from '@/lib/types';

export function DealsPageClient({ slug }: { slug: string }) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Load pipelines (triggers bootstrap if this is the first visit)
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/pipelines?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const data: Pipeline[] = await res.json();
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setPipelines(data);
          // Restore last active pipeline from localStorage
          try {
            const stored = localStorage.getItem(`chippi:deals:pipeline:${slug}`);
            const found = stored ? data.find((p) => p.id === stored) : null;
            setActivePipelineId(found ? found.id : data[0].id);
          } catch {
            setActivePipelineId(data[0].id);
          }
        }
      } catch {
        // non-fatal — board will show empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Persist active pipeline selection
  function handleSelect(id: string) {
    setActivePipelineId(id);
    try {
      localStorage.setItem(`chippi:deals:pipeline:${slug}`, id);
    } catch {
      // quota exceeded / storage disabled
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Deals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track your rental and buyer pipeline from lead to close
          </p>
        </div>
        <div className="h-8 w-64 rounded-lg bg-muted/50 animate-pulse" />
        <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Track your rental and buyer pipeline from lead to close
        </p>
      </div>

      {/* Pipeline tabs (Trello-like board selector) */}
      <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2 border border-border">
        <PipelineTabs
          slug={slug}
          pipelines={pipelines}
          activePipelineId={activePipelineId}
          onSelect={handleSelect}
          onPipelinesChange={setPipelines}
        />
      </div>

      {activePipelineId && (
        <>
          <PipelineSummary slug={slug} pipelineId={activePipelineId} />
          <KanbanBoard slug={slug} pipelineId={activePipelineId} />
        </>
      )}
    </div>
  );
}
