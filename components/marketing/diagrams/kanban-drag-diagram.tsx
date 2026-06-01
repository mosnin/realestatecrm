'use client';

/**
 * `<KanbanDragDiagram />` — a pipeline that updates itself.
 *
 * One beat: a deal card slides from Negotiating into Closed Won, and the
 * deal's side-panel fields auto-fill as a consequence. This is "drag a
 * card, Chippi keeps the rest in sync" demonstrated in one breath.
 *
 * Motion contract:
 *   - 8s cycle.
 *   - Pre-roll 700ms: board sits still.
 *   - Move: the card translates ~one column-width to the right, 320ms,
 *     EASE_APPLE, fading slightly mid-move so the eye reads "snap to
 *     the new home" not "card flying around".
 *   - 200ms after the card lands: column highlight on Closed Won decays.
 *     320ms after the card lands: first side-panel field ticks in
 *     ("Close date · Today"). 600ms after that: second field
 *     ("Final value · $475,000"). 700ms hold.
 *   - Reset: 200ms fade-out across the whole diagram, then re-arm.
 *
 * Reduced-motion: card sits in Closed Won, both side-panel fields visible.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface KanbanDragDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

// 0 = pre-roll, 1 = card moving, 2 = card landed, 3 = field 1 in,
// 4 = field 2 in, 5 = hold, 6 = fade-out (then reset to 0).
type Phase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const PHASE_TIMINGS_MS: { phase: Phase; at: number }[] = [
  { phase: 0, at: 0 },
  { phase: 1, at: 800 },
  { phase: 2, at: 1120 },
  { phase: 3, at: 1440 },
  { phase: 4, at: 2040 },
  { phase: 5, at: 2740 },
  { phase: 6, at: 4040 },
];
const CYCLE_RESET_AT = 4500;

const COLUMNS = [
  { name: 'New', cards: [{ name: 'Daniels family', tier: 'cold' as const }] },
  { name: 'Qualifying', cards: [{ name: 'C. Park', tier: 'warm' as const }] },
  { name: 'Negotiating', cards: [] }, // the moving card lives here at phase 0
  { name: 'Closed won', cards: [] },
];

// Static "other" cards rendered as paper-flat tiles. The lead tier dot
// uses the same lead-* tokens as the product so the diagram matches the
// real card vocabulary.
function StaticCard({
  name,
  tier,
  value,
  address,
}: {
  name: string;
  tier: 'cold' | 'warm' | 'hot';
  value?: string;
  address?: string;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            tier === 'hot' && 'bg-lead-hot',
            tier === 'warm' && 'bg-lead-warm',
            tier === 'cold' && 'bg-lead-cold',
          )}
        />
        <p className="text-[12px] font-medium leading-tight truncate text-foreground">
          {name}
        </p>
      </div>
      {address && (
        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
          {address}
        </p>
      )}
      {value && (
        <p
          className="text-[14px] tabular-nums text-foreground mt-1 leading-none"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {value}
        </p>
      )}
    </div>
  );
}

export function KanbanDragDiagram({
  aspect = 'video',
  className,
}: KanbanDragDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <KanbanDragContent />
    </ChippiDiagramShell>
  );
}

function KanbanDragContent() {
  const { reduced } = useDiagramMotion();
  const [phase, setPhase] = useState<Phase>(reduced ? 5 : 0);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      PHASE_TIMINGS_MS.forEach(({ phase: p, at }) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setPhase(p);
          }, at),
        );
      });
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setPhase(0);
          timers.push(setTimeout(runCycle, 500));
        }, CYCLE_RESET_AT),
      );
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  const cardInCW = phase >= 2 && phase <= 5;
  // Card position: while moving, animate via x translation. When landed,
  // we render it inside Closed Won column directly. Two render branches
  // so layout stays predictable.
  const cardMoving = phase === 1;

  return (
    <div className="w-full h-full flex gap-4 min-h-0">
      {/* Board — 4 columns, gap-3 between */}
      <div className="flex-1 grid grid-cols-4 gap-3 min-h-0">
        {COLUMNS.map((col, idx) => {
          const isCWCol = idx === 3;
          const showLanded = isCWCol && cardInCW;
          const isHighlight = isCWCol && (phase === 2 || phase === 3);
          return (
            <div
              key={col.name}
              className={cn(
                'flex flex-col min-h-0 rounded-lg transition-colors duration-300',
                isHighlight && 'bg-foreground/[0.03]',
              )}
            >
              <div className="px-1.5 pb-2 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                  {col.name}
                </p>
                <span className="text-[10px] tabular-nums text-muted-foreground/70">
                  {col.cards.length + (showLanded ? 1 : 0)}
                </span>
              </div>
              <div
                className={cn(
                  'flex-1 rounded-md p-1.5 space-y-2 min-h-0',
                  'bg-foreground/[0.02] border border-border/70',
                )}
              >
                {col.cards.map((c) => (
                  <StaticCard key={c.name} name={c.name} tier={c.tier} />
                ))}

                {/* Negotiating column starts with the moving deal card */}
                {idx === 2 && (phase === 0 || phase === 1) && (
                  <motion.div
                    layout={false}
                    initial={false}
                    animate={
                      cardMoving
                        ? { opacity: 0.4, x: 8 }
                        : { opacity: 1, x: 0 }
                    }
                    transition={{ duration: 0.28, ease: EASE_APPLE }}
                  >
                    <FocalDealCard />
                  </motion.div>
                )}

                {/* Closed Won column receives the card at phase 2+ */}
                {showLanded && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: EASE_APPLE }}
                  >
                    <FocalDealCard />
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side preview panel — same vocabulary as the deal quick-panel:
          hairline-divided rows, label muted, value foreground. Two rows
          tick in after the card lands. */}
      <div className="hidden md:flex w-[180px] shrink-0 flex-col min-h-0">
        <div className="rounded-lg border border-border/70 bg-card flex flex-col overflow-hidden">
          <div className="px-3 pt-2.5 pb-2 border-b border-border/60">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Deal
            </p>
            <p
              className="mt-1 text-[15px] tracking-tight text-foreground leading-snug"
              style={{ fontFamily: 'var(--font-title)' }}
            >
              415 Lexington
            </p>
          </div>
          <ul className="divide-y divide-border/60">
            <PanelRow
              label="Stage"
              value={cardInCW ? 'Closed won' : 'Negotiating'}
            />
            <PanelRow
              label="Close date"
              value="Today"
              show={phase >= 3}
            />
            <PanelRow
              label="Final value"
              value="$475,000"
              show={phase >= 4}
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

function FocalDealCard() {
  return (
    <div className="rounded-md border border-border/70 bg-background p-2.5">
      <div className="flex items-start gap-1.5">
        <GripVertical
          size={11}
          className="text-muted-foreground/40 mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-lead-hot" />
            <p className="text-[12px] font-medium leading-tight truncate text-foreground">
              M. Chen — 415 Lexington
            </p>
          </div>
          <p
            className="text-[14px] tabular-nums text-foreground mt-1 leading-none"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            $475,000
          </p>
        </div>
      </div>
    </div>
  );
}

function PanelRow({
  label,
  value,
  show = true,
}: {
  label: string;
  value: string;
  show?: boolean;
}) {
  return (
    <li className="px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <motion.p
        className="text-[12px] font-medium text-foreground tabular-nums mt-0.5"
        initial={false}
        animate={show ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        transition={{ duration: 0.22, ease: EASE_APPLE }}
      >
        {show ? value : ' '}
      </motion.p>
    </li>
  );
}
