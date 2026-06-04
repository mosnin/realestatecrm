'use client';

/**
 * `<StudioDiagram />` — Studio composes the post.
 *
 * One beat: a listing creative sits in the canvas, Chippi writes the caption
 * line by line, the channel chips light up, and a Schedule pill arrives. The
 * realtor watches a finished, on-brand post assemble itself — the whole
 * Studio pitch in one card.
 *
 * Motion contract: caption lines reveal in sequence, the Schedule pill lands
 * after the last line, hold, fade out, restart. Reduced motion lands the end
 * state with no timer. The creative block is a flat neutral panel — part of
 * the design, not a placeholder slot.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarClock, Instagram, Facebook, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  DiagramChippiBadge,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface StudioDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

const CAPTION = [
  'Just listed: 415 Lexington. South-facing two-bed',
  'with the rooftop everyone asks about. Tours open',
  'Saturday. Link in bio to book yours.',
];

const CHANNELS = [
  { name: 'Instagram', icon: Instagram },
  { name: 'Facebook', icon: Facebook },
  { name: 'Email', icon: Mail },
];

const LINE_INTERVAL = 280;
const PILL_DELAY = 360;
const HOLD = 1400;
const PAUSE = 700;

export function StudioDiagram({ aspect = 'video', className }: StudioDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <StudioContent />
    </ChippiDiagramShell>
  );
}

function StudioContent() {
  const { reduced } = useDiagramMotion();
  // -1 nothing, 0..2 caption lines, 3 = channels + schedule pill.
  const [phase, setPhase] = useState<number>(reduced ? 3 : -1);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function run() {
      CAPTION.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setPhase(i);
          }, i * LINE_INTERVAL + 400),
        );
      });
      timers.push(
        setTimeout(() => {
          if (!cancelled) setPhase(3);
        }, CAPTION.length * LINE_INTERVAL + PILL_DELAY + 400),
      );
      timers.push(
        setTimeout(
          () => {
            if (cancelled) return;
            setPhase(-1);
            timers.push(setTimeout(run, PAUSE));
          },
          CAPTION.length * LINE_INTERVAL + PILL_DELAY + HOLD + 400,
        ),
      );
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border border-border/70 bg-background overflow-hidden flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 sm:px-5 pt-3.5 pb-3 border-b border-border/60 flex items-center justify-between gap-2">
          <p
            className="text-[14px] sm:text-[15px] tracking-tight text-foreground leading-snug"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            New post
          </p>
          <DiagramChippiBadge label="Chippi" />
        </div>

        {/* Body — creative + caption */}
        <div className="flex-1 min-h-0 p-3 sm:p-4 flex gap-3">
          {/* Creative block — a flat neutral panel standing in for the listing
              image. Part of the design; not a media slot. */}
          <div className="hidden sm:flex shrink-0 w-[34%] rounded-xl border border-border/70 bg-muted/40 items-end p-2.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              415 Lexington
            </span>
          </div>

          {/* Caption + channels */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 space-y-1.5">
              {CAPTION.map((line, i) => {
                const visible = phase >= i;
                return (
                  <motion.p
                    key={i}
                    className="text-[12px] sm:text-[13px] leading-snug text-foreground"
                    initial={false}
                    animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                    transition={{ duration: 0.22, ease: EASE_APPLE }}
                  >
                    {line}
                  </motion.p>
                );
              })}
            </div>

            {/* Channels + schedule pill */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {CHANNELS.map((ch, i) => {
                  const Icon = ch.icon;
                  return (
                    <motion.span
                      key={ch.name}
                      aria-label={ch.name}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 text-muted-foreground"
                      initial={false}
                      animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 0 }}
                      transition={{ duration: 0.22, ease: EASE_APPLE, delay: i * 0.05 }}
                    >
                      <Icon size={13} strokeWidth={1.75} />
                    </motion.span>
                  );
                })}
              </div>
              <motion.span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-[11px] font-medium',
                  'bg-foreground text-background',
                )}
                initial={false}
                animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                transition={{ duration: 0.22, ease: EASE_APPLE }}
              >
                <CalendarClock size={11} strokeWidth={2} />
                Schedule
              </motion.span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
