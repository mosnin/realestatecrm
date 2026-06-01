'use client';

/**
 * `<TimelineDiagram />` — every touch, in order.
 *
 * One beat: a contact card on the left/top, a vertical timeline of touches
 * filling in from top to bottom — each row 600ms apart. Chippi-authored
 * rows wear the small agent badge so the realtor sees who did what.
 *
 * Motion contract:
 *   - 8.5s cycle.
 *   - 4 touches, 600ms apart. Each row: opacity 0 → 1, y 6 → 0, 280ms,
 *     EASE_APPLE.
 *   - Hold 1.6s after the last touch lands.
 *   - 200ms fade-out, 700ms pause, restart.
 *
 * Reduced-motion: all 4 touches visible.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mail, MessageSquare, CalendarCheck, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  DiagramChippiBadge,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface TimelineDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

interface Touch {
  icon: LucideIcon;
  label: string;
  detail: string;
  when: string;
  byChippi?: boolean;
}

const TOUCHES: Touch[] = [
  {
    icon: FileText,
    label: 'Submitted intake',
    detail: 'Two-bed, Brooklyn, $450–500k.',
    when: 'Mon',
  },
  {
    icon: Mail,
    label: 'Emailed back',
    detail: 'Sent the comparable sales for the block.',
    when: 'Tue',
    byChippi: true,
  },
  {
    icon: CalendarCheck,
    label: 'Tour scheduled',
    detail: '415 Lexington · Sat 2pm.',
    when: 'Wed',
  },
  {
    icon: MessageSquare,
    label: 'Offer drafted',
    detail: '$475,000, 30-day close.',
    when: 'Fri',
    byChippi: true,
  },
];

const TOUCH_AT = (i: number) => 500 + i * 600;
const HOLD_END = TOUCH_AT(TOUCHES.length - 1) + 1700;
const CYCLE_TOTAL = HOLD_END + 700;

export function TimelineDiagram({
  aspect = 'tall',
  className,
}: TimelineDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <TimelineContent />
    </ChippiDiagramShell>
  );
}

function TimelineContent() {
  const { reduced } = useDiagramMotion();
  const [visibleCount, setVisibleCount] = useState(
    reduced ? TOUCHES.length : 0,
  );

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      TOUCHES.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setVisibleCount(i + 1);
          }, TOUCH_AT(i)),
        );
      });
      timers.push(
        setTimeout(() => {
          if (!cancelled) setVisibleCount(0);
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

  return (
    <div className="w-full h-full flex flex-col gap-4 min-h-0">
      {/* Contact header — matches the product's contact detail header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
          <span className="text-[13px] font-medium text-foreground/80">MC</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-foreground leading-tight truncate">
            Marcus Chen
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            Buyer · Brooklyn · $450–500k
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15">
          <span className="w-1.5 h-1.5 rounded-full bg-lead-hot" />
          Hot
        </span>
      </div>

      {/* Quiet header for the timeline */}
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Recent activity
      </p>

      {/* Timeline rail — vertical line carries the structure. Each entry
          uses a small icon chip + body text + relative timestamp. */}
      <ol className="relative flex-1 min-h-0">
        {/* Continuous vertical hairline behind the icons */}
        <span
          aria-hidden
          className="absolute left-[15px] top-2 bottom-2 w-px bg-border/70"
        />
        <div className="space-y-3">
          {TOUCHES.map((t, i) => {
            const visible = visibleCount > i;
            const Icon = t.icon;
            return (
              <motion.li
                key={i}
                initial={false}
                animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.28, ease: EASE_APPLE }}
                className="relative flex items-start gap-3"
              >
                <div className="relative z-10 w-[30px] h-[30px] rounded-full bg-background border border-border/70 flex items-center justify-center flex-shrink-0">
                  <Icon
                    size={13}
                    strokeWidth={1.75}
                    className="text-foreground/80"
                  />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-medium text-foreground leading-tight truncate">
                      {t.label}
                    </p>
                    {t.byChippi && <DiagramChippiBadge label="Chippi" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {t.detail}
                  </p>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground pt-0.5 flex-shrink-0">
                  {t.when}
                </span>
              </motion.li>
            );
          })}
        </div>
      </ol>
    </div>
  );
}
