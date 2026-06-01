'use client';

/**
 * `<TeamLeaderboardDiagram />` — performance, on one page.
 *
 * One beat: a sortable leaderboard. The second-place realtor closes a
 * deal — their pipeline value snaps to a new total and the row settles
 * into the #1 slot. No ticker counter, no glow, no celebration. The
 * realtor sees the rank change in calm.
 *
 * Motion contract:
 *   - 8s cycle.
 *   - 1.0s hold on initial order.
 *   - Row reorder via Framer `layout` — 340ms, EASE_APPLE.
 *   - 200ms before reorder, the rising row's pipeline value snaps to its
 *     new value (single fade-swap, no count-up animation per stylesheet).
 *   - 3.5s hold on the new order.
 *   - 220ms fade-out across rank + values, 700ms pause, restart.
 *
 * Reduced-motion: render in the END state — Dom is #1 with the larger value.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface TeamLeaderboardDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

interface RealtorRow {
  id: string;
  name: string;
  initials: string;
  closed: number;
  pipelineBefore: string;
  closedAfter: number;
  pipelineAfter: string;
}

// Order is by pipeline value descending. After Dom closes the 415
// Lexington deal his pipeline ticks up past Kira's — the only row that
// changes.
const ROWS: RealtorRow[] = [
  {
    id: 'kira',
    name: 'Kira Watanabe',
    initials: 'KW',
    closed: 7,
    pipelineBefore: '$2.4M',
    closedAfter: 7,
    pipelineAfter: '$2.4M',
  },
  {
    id: 'dom',
    name: 'Dom Mendes',
    initials: 'DM',
    closed: 5,
    pipelineBefore: '$2.1M',
    closedAfter: 6,
    pipelineAfter: '$2.6M',
  },
  {
    id: 'theo',
    name: 'Theo Lin',
    initials: 'TL',
    closed: 4,
    pipelineBefore: '$1.4M',
    closedAfter: 4,
    pipelineAfter: '$1.4M',
  },
  {
    id: 'ana',
    name: 'Ana Soto',
    initials: 'AS',
    closed: 3,
    pipelineBefore: '$960k',
    closedAfter: 3,
    pipelineAfter: '$960k',
  },
];

const VALUE_SWAP_AT = 1100;
const REORDER_AT = 1300;
const HOLD_END = 4800;
const CYCLE_TOTAL = 5500;

export function TeamLeaderboardDiagram({
  aspect = 'square',
  className,
}: TeamLeaderboardDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <TeamLeaderboardContent />
    </ChippiDiagramShell>
  );
}

function TeamLeaderboardContent() {
  const { reduced } = useDiagramMotion();
  // false = before state, true = after Dom closed the deal.
  const [advanced, setAdvanced] = useState(reduced);
  const [valueSwapped, setValueSwapped] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      timers.push(setTimeout(() => !cancelled && setValueSwapped(true), VALUE_SWAP_AT));
      timers.push(setTimeout(() => !cancelled && setAdvanced(true), REORDER_AT));
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setAdvanced(false);
          setValueSwapped(false);
        }, HOLD_END),
      );
      timers.push(setTimeout(() => !cancelled && runCycle(), CYCLE_TOTAL));
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  // Compute the ordered list. Order key uses the active pipeline value's
  // numeric form. We sort by pipelineNumeric desc.
  const ordered = (() => {
    const withVal = ROWS.map((r) => {
      const pipelineStr = advanced ? r.pipelineAfter : r.pipelineBefore;
      const pipelineNum = parseFloat(
        pipelineStr.replace(/[^0-9.]/g, ''),
      ) * (pipelineStr.endsWith('M') ? 1000 : 1);
      return {
        ...r,
        pipelineNum,
        pipelineDisplay: pipelineStr,
        closedDisplay: advanced ? r.closedAfter : r.closed,
      };
    });
    return withVal.sort((a, b) => b.pipelineNum - a.pipelineNum);
  })();

  return (
    <div className="w-full h-full flex flex-col">
      {/* Quiet header */}
      <div className="pb-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          May · this month
        </p>
        <p
          className="mt-1 text-[18px] tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          By the floor
        </p>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[24px_1fr_auto_auto] gap-3 px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span></span>
        <span>Realtor</span>
        <span className="text-right">Closed</span>
        <span className="text-right">Pipeline</span>
      </div>

      {/* Rows — sortable list via layout animation */}
      <ul className="flex-1 divide-y divide-border/60 border-y border-border/60 min-h-0">
        <AnimatePresence initial={false}>
          {ordered.map((r, idx) => {
            const rank = idx + 1;
            const isMover = r.id === 'dom';
            return (
              <motion.li
                key={r.id}
                layout
                transition={{ duration: 0.34, ease: EASE_APPLE }}
                className="grid grid-cols-[24px_1fr_auto_auto] gap-3 items-center py-2.5 px-1"
              >
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {rank}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-medium text-foreground/80">
                      {r.initials}
                    </span>
                  </div>
                  <p className="text-[12px] font-medium text-foreground leading-tight truncate">
                    {r.name}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums text-foreground/80 text-right">
                  {isMover ? (
                    <motion.span
                      key={`closed-${valueSwapped ? 'after' : 'before'}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, ease: EASE_APPLE }}
                      className="inline-block"
                    >
                      {valueSwapped ? r.closedAfter : r.closed}
                    </motion.span>
                  ) : (
                    r.closedDisplay
                  )}
                </span>
                <span
                  className="text-[14px] tabular-nums text-foreground text-right leading-none"
                  style={{ fontFamily: 'var(--font-title)' }}
                >
                  {isMover ? (
                    <motion.span
                      key={`pipe-${valueSwapped ? 'after' : 'before'}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.22, ease: EASE_APPLE }}
                      className="inline-block"
                    >
                      {valueSwapped ? r.pipelineAfter : r.pipelineBefore}
                    </motion.span>
                  ) : (
                    r.pipelineDisplay
                  )}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
