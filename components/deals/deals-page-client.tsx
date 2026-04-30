'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { KanbanBoard } from './kanban-board';
import { PipelineSummary } from './pipeline-summary';
import { PipelineTabs } from './pipeline-tabs';
import { H1, TITLE_FONT, PRIMARY_PILL, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import type { Pipeline } from '@/lib/types';

export function DealsPageClient({ slug }: { slug: string }) {
  const router = useRouter();
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

  function handleAddDeal() {
    router.push(`/s/${slug}/deals/new`);
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <header className="flex items-end justify-between gap-4">
          <h1 className={H1} style={TITLE_FONT}>
            Pipeline
          </h1>
        </header>
        <div className="h-32 rounded-xl border border-border/70 bg-foreground/[0.02] animate-pulse" />
      </div>
    );
  }

  const hasPipelines = pipelines.length > 0;

  return (
    <div className="space-y-8">
      {/* Page header — serif H1 + single primary pill */}
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Pipeline
        </h1>
        {hasPipelines && (
          <button type="button" onClick={handleAddDeal} className={PRIMARY_PILL}>
            <Plus size={14} strokeWidth={2.25} />
            Add deal
          </button>
        )}
      </header>

      {activePipelineId && (
        <PipelineSummary slug={slug} pipelineId={activePipelineId} />
      )}

      {/* Board tabs — underline pattern. The "+" lives at the end of the strip. */}
      {hasPipelines && (
        <div className="flex items-center gap-2 border-b border-border/70">
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
        <KanbanBoard slug={slug} pipelineId={activePipelineId} />
      )}

      {/* Empty state — no decorative icon, serif H2 + primary pill */}
      {!hasPipelines && (
        <CreateFirstBoardCard
          slug={slug}
          onCreated={(p) => {
            setPipelines([p]);
            setActivePipelineId(p.id);
            try {
              localStorage.setItem(`chippi:deals:pipeline:${slug}`, p.id);
            } catch {}
          }}
        />
      )}
    </div>
  );
}

// First-run placeholder. Paper-flat. One click creates a default board.
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
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h2
        className="text-2xl tracking-tight text-foreground mb-2"
        style={TITLE_FONT}
      >
        No pipeline yet.
      </h2>
      <p className={cn(BODY_MUTED, 'max-w-sm mb-6')}>
        A pipeline is a board of stages. Make one and start tracking deals.
      </p>
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className={cn(PRIMARY_PILL, 'disabled:opacity-50')}
      >
        <Plus size={14} strokeWidth={2.25} />
        {pending ? 'Creating…' : 'Create your first board'}
      </button>
    </div>
  );
}
