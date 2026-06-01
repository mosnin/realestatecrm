'use client';

/**
 * `<LeadScoreDiagram />` — hot, warm, cold, at a glance.
 *
 * One beat: three new leads get scored in sequence, then the list reorders
 * itself so Hot is on top. The whole motion is one breath — score, score,
 * score, settle.
 *
 * Motion contract:
 *   - 8s cycle.
 *   - Each score pill fades + slides 4px right onto its card, 240ms apart,
 *     EASE_APPLE.
 *   - 360ms after the last pill lands, the rows reorder (Hot → Warm → Cold)
 *     via `motion.div` layout animation, 280ms, EASE_APPLE.
 *   - 1.5s hold, then everything fades to score-empty + original order
 *     and the cycle resumes.
 *
 * Reduced-motion: render the END state — all three scored AND already
 * sorted Hot → Warm → Cold.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface LeadScoreDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

interface Lead {
  id: string;
  name: string;
  source: string;
  tier: 'cold' | 'warm' | 'hot';
}

// In intake order (Sandra arrived first, then James, then Marcus). The
// scoring sequence below dictates which tier each gets — Marcus turns out
// to be the hottest and rises to the top.
const INTAKE_ORDER: Lead[] = [
  { id: 'sandra', name: 'Sandra Liu', source: 'Zillow intake', tier: 'cold' },
  { id: 'james', name: 'James O’Connor', source: 'Referral · M. Patel', tier: 'warm' },
  { id: 'marcus', name: 'Marcus Chen', source: 'Open house · 415 Lex', tier: 'hot' },
];

// Phase: -1 (none scored), 0/1/2 (that many scored), 3 (reordered),
// 4 (fade-out before reset).
const SCORE_TIMINGS = [400, 700, 1000];
const REORDER_AT = 1500;
const HOLD_END = 4400;
const CYCLE_TOTAL = 4900;

export function LeadScoreDiagram({
  aspect = 'square',
  className,
}: LeadScoreDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <LeadScoreContent />
    </ChippiDiagramShell>
  );
}

function LeadScoreContent() {
  const { reduced } = useDiagramMotion();
  const [scoredCount, setScoredCount] = useState(reduced ? 3 : 0);
  const [reordered, setReordered] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      SCORE_TIMINGS.forEach((t, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setScoredCount(i + 1);
          }, t),
        );
      });
      timers.push(
        setTimeout(() => {
          if (!cancelled) setReordered(true);
        }, REORDER_AT),
      );
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setReordered(false);
          setScoredCount(0);
        }, HOLD_END),
      );
      timers.push(
        setTimeout(() => {
          if (!cancelled) runCycle();
        }, CYCLE_TOTAL),
      );
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  const orderedLeads = useMemo(() => {
    if (!reordered) return INTAKE_ORDER;
    // Hot, Warm, Cold — sort key by tier rank.
    const rank: Record<Lead['tier'], number> = { hot: 0, warm: 1, cold: 2 };
    return [...INTAKE_ORDER].sort((a, b) => rank[a.tier] - rank[b.tier]);
  }, [reordered]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Quiet header — same status-sentence pattern as a product page. */}
      <div className="pb-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          New leads
        </p>
        <p
          className="mt-1 text-[18px] tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Today’s arrivals
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Scored on arrival, sorted by who to call first.
        </p>
      </div>

      {/* The list — divide-y rows, matches the product's row vocabulary. */}
      <ul className="flex-1 divide-y divide-border/60 border-y border-border/60">
        {orderedLeads.map((lead, idx) => {
          // Find which intake index this lead originally had — that's the
          // score-reveal index. Score is visible once `scoredCount` reaches
          // intakeIndex + 1.
          const intakeIndex = INTAKE_ORDER.findIndex((l) => l.id === lead.id);
          const scored = scoredCount > intakeIndex;
          return (
            <motion.li
              key={lead.id}
              layout
              transition={{ duration: 0.32, ease: EASE_APPLE }}
              className="py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-medium text-foreground/80">
                  {lead.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground leading-tight truncate">
                  {lead.name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {lead.source}
                </p>
              </div>
              <AnimatePresence initial={false}>
                {scored && <ScorePill tier={lead.tier} />}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function ScorePill({ tier }: { tier: Lead['tier'] }) {
  const label = tier === 'hot' ? 'Hot' : tier === 'warm' ? 'Warm' : 'Cold';
  return (
    <motion.span
      initial={{ opacity: 0, x: 4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: EASE_APPLE }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-[11px] font-medium tabular-nums',
        tier === 'hot' && 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
        tier === 'warm' && 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
        tier === 'cold' && 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          tier === 'hot' && 'bg-lead-hot',
          tier === 'warm' && 'bg-lead-warm',
          tier === 'cold' && 'bg-lead-cold',
        )}
      />
      {label}
    </motion.span>
  );
}
