'use client';

/**
 * Broker kanban column.
 *
 * Mirrors the realtor KanbanColumn header and drop-zone look exactly:
 * stage-color dot + name + count + compact value total. The differences
 * from the realtor version:
 *
 *  - No drag handle (no column reorder).
 *  - No quick-add input (the broker doesn't create realtor deals).
 *  - No delete-stage button.
 *  - Renders BrokerDealCard instead of DealCard.
 *
 * AnimatePresence wraps cards for clean enter/exit, matching the
 * realtor board's behavior.
 */

import { useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { BrokerDealCard, type BrokerDealItem } from './broker-deal-card';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { formatCompact } from '@/lib/formatting';
import { cn } from '@/lib/utils';

interface BrokerKanbanColumnProps {
  stageId: string;
  stageName: string;
  stageColor: string;
  deals: BrokerDealItem[];
  onOpenDeal: (deal: BrokerDealItem) => void;
}

export function BrokerKanbanColumn({
  stageName,
  stageColor,
  deals,
  onOpenDeal,
}: BrokerKanbanColumnProps) {
  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  // Stagger entrance only on the FIRST mount — afterwards AnimatePresence
  // handles individual add/remove without re-choreographing the column.
  // Mirrors the realtor KanbanColumn discipline so a filter change doesn't
  // re-cascade an entire column.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      hasMountedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header — mirrors realtor KanbanColumn header exactly: a
          stage-color dot ringed against the background, the name, a count
          chip, and the per-stage total counting up. */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-background"
            style={{ backgroundColor: stageColor }}
            aria-hidden
          />
          <span className="text-base font-semibold text-foreground truncate">
            {stageName}
          </span>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-foreground/[0.06] text-[11px] font-medium text-muted-foreground tabular-nums">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            <AnimatedNumber value={totalValue} format={formatCompact} duration={600} />
          </span>
        )}
      </div>

      {/* Drop zone look — same class structure as the realtor column */}
      <div
        className={cn(
          'flex-1 min-h-24 rounded-lg p-2',
          'bg-foreground/[0.02] border border-border/70',
        )}
      >
        {/*
          `initial={false}` after first mount keeps re-renders (filter
          changes, realtor narrowing) from re-choreographing the whole
          column — only genuinely added/removed cards animate. The first
          paint still staggers because hasMountedRef is false on that frame.
        */}
        <AnimatePresence initial={!hasMountedRef.current}>
          {deals.map((deal, idx) => (
            <BrokerDealCard
              key={deal.id}
              deal={deal}
              stageColor={stageColor}
              entranceIndex={hasMountedRef.current ? null : idx}
              onClick={onOpenDeal}
            />
          ))}
        </AnimatePresence>
        {deals.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-muted-foreground/40">
            <Inbox size={16} aria-hidden />
            <p className="text-xs">No deals</p>
          </div>
        )}
      </div>
    </div>
  );
}
