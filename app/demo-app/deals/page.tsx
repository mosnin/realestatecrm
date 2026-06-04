'use client';

/**
 * /demo-app/deals - backend-free clone of /s/[slug]/deals.
 *
 * Mirrors `DealsPageClient`: serif H1 + "Tell Chippi" pill, the four-cell
 * pipeline summary (reused), the Active/Closed segmented toggle with the
 * sliding underline, search, the focus chip, and the kanban board. All data
 * is hardcoded; no auth, no Supabase, no API. A single pipeline, so the
 * pipeline tabs are hidden - same as the real page when there's one board.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { PipelineSummary } from '@/components/deals/pipeline-summary';
import { H1, TITLE_FONT, PRIMARY_PILL, QUIET_LINK, PAGE_MAX } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { BoardStatus, BoardFocus } from '@/components/deals/deals-page-client';
import { DemoBoard } from './demo-board';
import { DEMO_SUMMARY_STAGES } from './demo-data';

const STATUS_TABS: ReadonlyArray<{ key: BoardStatus; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];

export default function DemoDealsPage() {
  const [boardStatus, setBoardStatus] = useState<BoardStatus>('active');
  const [focus, setFocus] = useState<BoardFocus>(null);
  const [searchQuery, setSearchQuery] = useState('');

  function handleStatusChange(next: BoardStatus) {
    if (next === boardStatus) return;
    setBoardStatus(next);
    if (next === 'closed') setFocus(null);
  }

  return (
    <div
      className={cn(
        'dashboard-content w-full',
        PAGE_MAX,
        'mx-auto min-w-0 px-4 sm:px-6 md:px-10 lg:px-12 py-5 md:py-7 pb-28 space-y-8',
      )}
    >
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Deals
        </h1>
        <div className="flex flex-col items-end gap-1">
          <span className={PRIMARY_PILL}>Tell Chippi &rarr;</span>
          <span className={QUIET_LINK}>or fill out the form</span>
        </div>
      </header>

      {boardStatus === 'active' && (
        <PipelineSummary
          slug="demo"
          pipelineId="demo-pipeline"
          focus={focus}
          onFocusChange={setFocus}
          onAddDeal={() => {}}
          refreshKey={0}
          initialStages={DEMO_SUMMARY_STAGES}
        />
      )}

      <div className="flex items-center gap-3 flex-wrap border-b border-border/70">
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
                  'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out',
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

        <div className="ml-auto flex items-center gap-2 flex-wrap pb-2 sm:pb-0">
          <div className="relative min-w-[140px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals&hellip;"
              className="pl-9 pr-7 h-9 w-full sm:w-64 text-sm rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {focus && (
            <button
              type="button"
              onClick={() => setFocus(null)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors duration-150"
            >
              <span>{focus === 'at-risk' ? 'At risk' : 'Closing this month'}</span>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <DemoBoard boardStatus={boardStatus} focus={focus} searchQuery={searchQuery} />
    </div>
  );
}
