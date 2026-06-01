'use client';

/**
 * `<LeadRoutingDiagram />` — every lead, the right realtor.
 *
 * One beat: a new-lead pill on the left; a stroked path draws to a
 * center routing-engine card; a second path draws to one of three realtor
 * pills on the right; the chosen realtor's pill firms up (border darkens
 * a hairline). That's it.
 *
 * Motion contract:
 *   - 8s cycle.
 *   - Phase 0 (800ms): empty stroke paths, lead pill quiet.
 *   - Phase 1 (320ms): first path draws (lead → engine) via stroke-dashoffset.
 *   - Phase 2 (320ms, 200ms after phase 1): second path draws (engine → assigned realtor).
 *   - Phase 3 (220ms, 100ms after phase 2): assigned realtor pill's border firms.
 *   - 2.5s hold. Then 240ms fade-out across paths + highlight. 700ms pause. Restart.
 *
 * Reduced-motion: paths drawn full, assigned realtor highlighted.
 *
 * SVG choice: the path-draw is a stroke-dashoffset animation, NOT a
 * bouncing arrow. The path renders as a hairline (1px) in `currentColor`
 * (foreground/40) so it reads as line-art, not "marketing illustration".
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface LeadRoutingDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

const REALTORS = [
  { id: 'k', name: 'Kira', initials: 'KW' },
  { id: 'd', name: 'Dom', initials: 'DM' },
  { id: 't', name: 'Theo', initials: 'TL' },
];
const ASSIGNED_REALTOR_ID = 'd';

const P1_AT = 700;
const P2_AT = 1250;
const P3_AT = 1700;
const HOLD_END = 4500;
const CYCLE_TOTAL = 5300;

export function LeadRoutingDiagram({
  aspect = 'wide',
  className,
}: LeadRoutingDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={8} className={className}>
      <LeadRoutingContent />
    </ChippiDiagramShell>
  );
}

function LeadRoutingContent() {
  const { reduced } = useDiagramMotion();
  // 0 = nothing drawn; 1 = path 1 drawn; 2 = path 2 drawn; 3 = realtor pill firmed.
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(reduced ? 3 : 0);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      timers.push(setTimeout(() => !cancelled && setPhase(1), P1_AT));
      timers.push(setTimeout(() => !cancelled && setPhase(2), P2_AT));
      timers.push(setTimeout(() => !cancelled && setPhase(3), P3_AT));
      timers.push(setTimeout(() => !cancelled && setPhase(0), HOLD_END));
      timers.push(setTimeout(() => !cancelled && runCycle(), CYCLE_TOTAL));
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  // Path drawing via stroke-dasharray. We pick a pathLength of 1 so the
  // animation reads as percent regardless of the real path length.
  const pathDraw = (visible: boolean) => ({
    strokeDasharray: '1 1',
    strokeDashoffset: visible ? 0 : 1,
    pathLength: 1,
  });

  return (
    <div className="w-full h-full flex items-stretch min-h-0 gap-4 md:gap-8">
      {/* Left rail — incoming lead */}
      <div className="flex flex-col justify-center w-[180px] flex-shrink-0">
        <div className="rounded-xl border border-border/70 bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            New lead
          </p>
          <p className="mt-1 text-[13px] font-medium text-foreground leading-tight">
            Sandra Liu
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Zillow intake · Brooklyn
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15">
            <span className="w-1.5 h-1.5 rounded-full bg-lead-cold" />
            Cold lead · just now
          </div>
        </div>
      </div>

      {/* Center — routing engine + stroked paths overlay */}
      <div className="relative flex-1 min-w-0 flex items-center justify-center">
        {/* Path overlay covers the whole center column */}
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full text-foreground/40"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {/* Path 1: from lead (left edge of center column) to where the
              engine card visually begins. We stop the path well before the
              engine card so the eye reads "the line reaches the engine"
              rather than crossing under it. The engine card occupies the
              middle ~40% of the column; paths stop at the 30/70 mark. */}
          <motion.path
            d="M 0,50 L 30,50"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            initial={false}
            animate={pathDraw(phase >= 1)}
            transition={{ duration: 0.32, ease: EASE_APPLE }}
            vectorEffect="non-scaling-stroke"
          />
          {/* Path 2: from engine's right edge to the assigned realtor. */}
          <motion.path
            d="M 70,50 L 100,50"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            initial={false}
            animate={pathDraw(phase >= 2)}
            transition={{ duration: 0.32, ease: EASE_APPLE }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Engine card centered */}
        <div
          className={cn(
            'relative z-10 rounded-xl border border-border/70 bg-background',
            'px-3.5 py-2.5 max-w-[180px]',
          )}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            auto-assignment
          </p>
          <p className="mt-1 text-[12px] text-foreground leading-tight">
            Brooklyn · weighted by load
          </p>
        </div>
      </div>

      {/* Right rail — three realtor pills, middle one is the assignee */}
      <div className="flex flex-col justify-center gap-2 w-[180px] flex-shrink-0">
        {REALTORS.map((r) => {
          const isAssigned = r.id === ASSIGNED_REALTOR_ID;
          const highlight = isAssigned && phase >= 3;
          return (
            <motion.div
              key={r.id}
              initial={false}
              animate={{
                opacity: highlight ? 1 : isAssigned ? 0.9 : 0.7,
              }}
              transition={{ duration: 0.22, ease: EASE_APPLE }}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-2.5 py-2',
                'border bg-background transition-colors duration-300',
                highlight ? 'border-foreground/40' : 'border-border/70',
              )}
            >
              <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-medium text-foreground/80">
                  {r.initials}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-foreground leading-tight">
                  {r.name}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {isAssigned ? '3 in flight · 2 today' : '5 in flight'}
                </p>
              </div>
              {highlight && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.22, ease: EASE_APPLE }}
                  className="text-[10px] font-medium text-foreground"
                >
                  Assigned
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
