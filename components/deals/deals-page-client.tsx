'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { KanbanBoard } from './kanban-board';
import { PipelineSummary } from './pipeline-summary';
import { PipelineTabs } from './pipeline-tabs';
import { H1, TITLE_FONT, PRIMARY_PILL, BODY_MUTED } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { Pipeline } from '@/lib/types';

/** What's visible on the board. Two states. Default 'active'. */
export type BoardStatus = 'active' | 'closed';

/**
 * The narrowing focus selected from the stat strip / narration line.
 * `null` means "show me everything in this status." A focus is a way for the
 * realtor to pull a specific story out of the data — "show me what's at
 * risk", "show me what's closing this month" — without configuring a popover.
 */
export type BoardFocus = 'at-risk' | 'closing-month' | null;

const STATUS_TABS: ReadonlyArray<{ key: BoardStatus; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];

export function DealsPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Board filters live up here so the stat strip and the kanban share state.
  // The narration sentence and the stat cells double as filter triggers — when
  // you click "At risk: 3", the board narrows to those three. The page tells
  // one story instead of two.
  const [boardStatus, setBoardStatus] = useState<BoardStatus>('active');
  const [focus, setFocus] = useState<BoardFocus>(null);

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
  function handleSelectPipeline(id: string) {
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

  function handleStatusChange(next: BoardStatus) {
    if (next === boardStatus) return;
    setBoardStatus(next);
    // Switching status drops the focus filter — those filters are about
    // active deals; carrying them into the closed view is meaningless.
    if (next === 'closed') setFocus(null);
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <header className="flex items-end justify-between gap-4">
          <h1 className={H1} style={TITLE_FONT}>
            Deals
          </h1>
        </header>
        <div className="h-32 rounded-xl border border-border/70 bg-foreground/[0.02] animate-pulse" />
      </div>
    );
  }

  const hasPipelines = pipelines.length > 0;

  return (
    <div className="space-y-8">
      {/* Page header — serif H1 + single primary pill. The H1 is the noun
          realtors use ("deals"); the URL, narration, and Add button all
          agree. */}
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Deals
        </h1>
        {hasPipelines && (
          <button type="button" onClick={handleAddDeal} className={PRIMARY_PILL}>
            <Plus size={14} strokeWidth={2.25} />
            Add deal
          </button>
        )}
      </header>

      {activePipelineId && boardStatus === 'active' && (
        <PipelineSummary
          slug={slug}
          pipelineId={activePipelineId}
          focus={focus}
          onFocusChange={setFocus}
          onAddDeal={handleAddDeal}
        />
      )}

      {/* Pipeline tabs — switch between boards (e.g. Sales / Listings) */}
      {hasPipelines && (
        <div className="flex items-center gap-2 border-b border-border/70">
          <PipelineTabs
            slug={slug}
            pipelines={pipelines}
            activePipelineId={activePipelineId}
            onSelect={handleSelectPipeline}
            onPipelinesChange={setPipelines}
          />
        </div>
      )}

      {/* Status segmented toggle — Active / Closed only. Two states, sliding
          underline via motion.layoutId so the eye knows the page is changing
          its mind, not just the cards. Same vocabulary as the contact tab
          strip and broker reviews. */}
      {hasPipelines && (
        <div role="tablist" aria-label="Deal status" className="flex items-center gap-0">
          {STATUS_TABS.map((t) => {
            const isActive = boardStatus === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleStatusChange(t.key)}
                className={cn(
                  'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
                {isActive && (
                  <motion.span
                    layoutId="deals-status-underline"
                    className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                    transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {activePipelineId && (
        <KanbanBoard
          slug={slug}
          pipelineId={activePipelineId}
          boardStatus={boardStatus}
          focus={focus}
          onClearFocus={() => setFocus(null)}
        />
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
        A board of stages — make one and I&apos;ll start tracking your deals.
      </p>
      <button
        type="button"
        onClick={handleCreate}
        disabled={pending}
        className={cn(PRIMARY_PILL, 'disabled:opacity-50')}
      >
        <Plus size={14} strokeWidth={2.25} />
        {pending ? 'One moment.' : 'Create your first board'}
      </button>
    </div>
  );
}
