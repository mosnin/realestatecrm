'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { KanbanBoard } from './kanban-board';
import { PipelineSummary } from './pipeline-summary';
import { PipelineTabs } from './pipeline-tabs';
import { PageTitle } from '@/components/ui/page-title';
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
      <div className="space-y-6">
        <PageTitle>Pipeline</PageTitle>
        <div className="h-8 w-64 rounded-lg bg-muted/50 animate-pulse" />
        <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    );
  }

  const hasPipelines = pipelines.length > 0;

  return (
    <div className="space-y-6">
      <PageTitle>Pipeline</PageTitle>

      {/* Pipeline tabs (board selector) — paper-flat hairline strip */}
      {hasPipelines && (
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2">
          <PipelineTabs
            slug={slug}
            pipelines={pipelines}
            activePipelineId={activePipelineId}
            onSelect={handleSelect}
            onPipelinesChange={setPipelines}
          />
        </div>
      )}

      {activePipelineId && (
        <>
          <PipelineSummary slug={slug} pipelineId={activePipelineId} />
          <KanbanBoard slug={slug} pipelineId={activePipelineId} />
        </>
      )}

      {/* Empty state — first-run placeholder card */}
      {!hasPipelines && (
        <CreateFirstBoardCard
          slug={slug}
          onCreated={(p) => {
            setPipelines([p]);
            setActivePipelineId(p.id);
            try { localStorage.setItem(`chippi:deals:pipeline:${slug}`, p.id); } catch {}
          }}
        />
      )}
    </div>
  );
}

// First-run dashed placeholder. Paper-flat. One click creates a default board.
function CreateFirstBoardCard({
  slug,
  onCreated,
}: {
  slug: string;
  onCreated: (p: Pipeline) => void;
}) {
  const [pending, setPending] = useState(false);
  async function handleCreate() {
    setPending(true);
    try {
      const res = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: 'Pipeline', color: '#6366f1' }),
      });
      if (!res.ok) return;
      const created: Pipeline = await res.json();
      onCreated(created);
    } finally {
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={pending}
      className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150 disabled:opacity-50"
    >
      <Plus size={16} />
      <span>{pending ? 'Creating board…' : 'Create your first board'}</span>
    </button>
  );
}
