'use client';

/**
 * `<CalendarBookingDiagram />` — booked from the reply.
 *
 * One beat: an empty calendar week view; a TOUR block fades into the
 * Wednesday 2pm slot; a small "Confirmed with M. Chen" pill appears
 * below the block, anchored by the Chippi badge.
 *
 * Motion contract:
 *   - 7.5s cycle.
 *   - 800ms hold on empty grid.
 *   - Tour block: opacity 0 → 1 + 6px y-translate up, 280ms, EASE_APPLE.
 *   - 600ms after block lands, confirmation pill fades in (220ms).
 *   - 2.2s hold. Then 200ms fade-out across both, 700ms pause, restart.
 *
 * Reduced-motion: render tour block + confirmation pill visible.
 *
 * Visual vocabulary matches the product calendar:
 *   - Hairline border around the whole grid (`border-border/60`).
 *   - Header row with day labels (`bg-muted/20`).
 *   - Hour rows separated by `border-t border-border/60`.
 *   - Event block: `bg-muted/40 rounded text-[11px] font-medium`.
 *   - Time-of-day labels: `text-[11px] tabular-nums text-muted-foreground`.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  DiagramChippiBadge,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface CalendarBookingDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = ['10', '11', '12', '1', '2', '3'];

// Phase: 0 empty, 1 tour visible, 2 tour + confirm visible, 3 fade-out.
const TOUR_AT = 900;
const CONFIRM_AT = 1500;
const HOLD_END = 4000;
const CYCLE_TOTAL = 4600;

export function CalendarBookingDiagram({
  aspect = 'video',
  className,
}: CalendarBookingDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <CalendarBookingContent />
    </ChippiDiagramShell>
  );
}

function CalendarBookingContent() {
  const { reduced } = useDiagramMotion();
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(reduced ? 2 : 0);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      timers.push(setTimeout(() => !cancelled && setPhase(1), TOUR_AT));
      timers.push(setTimeout(() => !cancelled && setPhase(2), CONFIRM_AT));
      timers.push(setTimeout(() => !cancelled && setPhase(3), HOLD_END));
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          setPhase(0);
        }, HOLD_END + 250),
      );
      timers.push(setTimeout(() => !cancelled && runCycle(), CYCLE_TOTAL));
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  const tourVisible = phase === 1 || phase === 2;
  const confirmVisible = phase === 2;

  return (
    <div className="w-full h-full flex flex-col gap-3 min-h-0">
      {/* Calendar week grid — matches product calendar vocabulary. */}
      <div className="flex-1 border border-border/60 rounded-md overflow-hidden bg-background flex flex-col min-h-0">
        {/* Header row: time-column gutter + day labels */}
        <div className="grid grid-cols-[40px_repeat(5,minmax(0,1fr))] border-b border-border/60 bg-muted/20">
          <div />
          {DAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              {d}
              <span className="block text-[12px] tabular-nums text-foreground/80 leading-tight mt-0.5">
                {DAYS.indexOf(d) + 4}
              </span>
            </div>
          ))}
        </div>

        {/* Hour grid */}
        <div className="flex-1 grid grid-cols-[40px_repeat(5,minmax(0,1fr))] grid-rows-6 min-h-0">
          {HOURS.map((h, rowIdx) => (
            <div key={h} className="contents">
              {/* Time gutter cell */}
              <div
                className={cn(
                  'px-1.5 py-1 text-[10px] tabular-nums text-muted-foreground/80 text-right',
                  rowIdx > 0 && 'border-t border-border/60',
                )}
              >
                {h}
              </div>
              {DAYS.map((d) => {
                const isTourCell = d === 'Wed' && h === '2';
                return (
                  <div
                    key={`${d}-${h}`}
                    className={cn(
                      'relative border-l border-border/60',
                      rowIdx > 0 && 'border-t border-border/60',
                    )}
                  >
                    {isTourCell && (
                      <motion.div
                        initial={false}
                        animate={
                          tourVisible
                            ? { opacity: 1, y: 0 }
                            : { opacity: 0, y: 6 }
                        }
                        transition={{ duration: 0.28, ease: EASE_APPLE }}
                        className={cn(
                          'absolute inset-x-1 top-1 bottom-1 rounded',
                          'bg-foreground/[0.06] border border-foreground/15',
                          'px-1.5 py-1 flex flex-col justify-between',
                        )}
                      >
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-foreground/70 leading-none">
                            Tour
                          </p>
                          <p className="text-[10px] font-medium text-foreground leading-tight mt-1 truncate">
                            415 Lexington
                          </p>
                        </div>
                        <p className="text-[10px] tabular-nums text-muted-foreground leading-none">
                          2 – 2:45p
                        </p>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation strip — quiet hairline-divided row below the grid.
          Sits at the foot of the diagram; the Chippi badge anchors the
          authorship. */}
      <motion.div
        initial={false}
        animate={confirmVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
        transition={{ duration: 0.24, ease: EASE_APPLE }}
        className="flex items-center gap-2.5 text-[11px]"
      >
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-foreground/[0.04] flex-shrink-0">
          <CalendarCheck size={12} strokeWidth={1.75} className="text-foreground/80" />
        </span>
        <span className="text-foreground">Confirmed with M. Chen</span>
        <span className="text-muted-foreground tabular-nums">Wed · 2pm</span>
        <span className="ml-auto">
          <DiagramChippiBadge label="Chippi" />
        </span>
      </motion.div>
    </div>
  );
}
