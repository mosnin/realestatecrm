'use client';

/**
 * `<ComposerDraftDiagram />` — Chippi drafts the reply.
 *
 * One beat: a Chippi-authored draft fills in below a real-looking email
 * composer, then a Send pill appears. The realtor sees the agent typing
 * the email they were going to type anyway. That's the whole pitch in
 * one card.
 *
 * Motion contract:
 *   - 6.8s cycle, ~1.3s tail hold before reset.
 *   - The draft body fills in 4 lines; each line lands 280ms after the
 *     prior, opacity + 6px y-translate, EASE_APPLE.
 *   - When the body has 4 lines, a Send pill fades in (220ms).
 *   - Reset: everything fades out together (180ms), 600ms hold, restart.
 *   - No character-by-character typing on the subject (slop tell).
 *   - No spinning, no pulsing, no fake cursors.
 *
 * Reduced-motion: render the END state — all 4 lines + Send pill visible,
 * no internal timer running.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brandOrange } from '@/lib/colors';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  DiagramChippiBadge,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface ComposerDraftDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

const DRAFT_LINES = [
  'Hi Marcus — happy to show you 415 Lexington on',
  'Saturday at 2pm. It’s a south-facing two-bed with',
  'the rooftop your wife asked about. I’ll bring the',
  'comparable sales for the block — see you then.',
];

// Phase budget. Each line lands 280ms after the prior; the Send pill
// arrives 360ms after the last line; we hold ~1.3s, then reset.
const LINE_INTERVAL = 280;
const SEND_DELAY_AFTER_LAST_LINE = 360;
const HOLD_BEFORE_RESET = 1300;
const FADE_OUT = 200;
const PAUSE_AFTER_RESET = 700;

export function ComposerDraftDiagram({
  aspect = 'square',
  className,
}: ComposerDraftDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <ComposerDraftContent />
    </ChippiDiagramShell>
  );
}

function ComposerDraftContent() {
  const { reduced } = useDiagramMotion();
  // -1 = nothing drafted yet, 0..3 = that many lines visible, 4 = all lines
  //  + Send pill visible. Reduced-motion lands at 4 immediately.
  const [phase, setPhase] = useState<number>(reduced ? 4 : -1);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      // Step 0..3 — reveal each line in sequence.
      DRAFT_LINES.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setPhase(i);
          }, i * LINE_INTERVAL + 400),
        );
      });
      // Step 4 — Send pill arrives.
      timers.push(
        setTimeout(
          () => {
            if (!cancelled) setPhase(4);
          },
          DRAFT_LINES.length * LINE_INTERVAL + SEND_DELAY_AFTER_LAST_LINE + 400,
        ),
      );
      // Hold, then reset to -1 and re-arm.
      timers.push(
        setTimeout(
          () => {
            if (cancelled) return;
            setPhase(-1);
            timers.push(setTimeout(runCycle, PAUSE_AFTER_RESET));
          },
          DRAFT_LINES.length * LINE_INTERVAL +
            SEND_DELAY_AFTER_LAST_LINE +
            HOLD_BEFORE_RESET +
            FADE_OUT +
            400,
        ),
      );
    }

    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Composer card. Hairline border, paper-flat. Same vocabulary as
          the product's email read view (subject as headline, sender below). */}
      <div className="flex-1 rounded-xl border border-border/70 bg-background overflow-hidden flex flex-col">
        {/* Header strip: Re: subject + meta. Subject does NOT animate. */}
        <div className="px-5 pt-4 pb-3 border-b border-border/60">
          <p
            className="text-[15px] tracking-tight text-foreground leading-snug"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            Re: 415 Lexington, tour Saturday
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            To <span className="text-foreground/80">Marcus Chen</span>
          </p>
        </div>

        {/* Body area — empty above the draft card; the draft is the only
            thing the eye lands on. */}
        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          {/* Chippi draft card. Left rail tinted with the agent border
              treatment so the block reads as "this came from Chippi". */}
          <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <DiagramChippiBadge />
                <span className="text-[11px] text-muted-foreground truncate">
                  Drafted just now.
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                Draft
              </span>
            </div>
            <div className={brandOrange('AGENT_BADGE', 'px-3.5 py-3 border-l-2 border-orange-400 dark:border-orange-500/60')}>
              <div className="space-y-1.5 min-h-[64px]">
                {DRAFT_LINES.map((line, i) => {
                  const visible = phase >= i;
                  return (
                    <motion.p
                      key={i}
                      className="text-[13px] leading-snug text-foreground"
                      initial={false}
                      animate={
                        visible
                          ? { opacity: 1, y: 0 }
                          : { opacity: 0, y: 6 }
                      }
                      transition={{ duration: 0.22, ease: EASE_APPLE }}
                    >
                      {line}
                    </motion.p>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground">
                Drafted from the last thread.
              </p>
            </div>
          </div>

          {/* Send pill — appears once the draft has fully landed. Paper-flat
              foreground pill, same as the product's PRIMARY_PILL vocabulary. */}
          <div className="flex items-center justify-end pt-1">
            <motion.span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-[11px] font-medium',
                'bg-foreground text-background',
              )}
              initial={false}
              animate={
                phase >= 4
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: 4 }
              }
              transition={{ duration: 0.22, ease: EASE_APPLE }}
            >
              <Send size={11} strokeWidth={2} />
              Send
            </motion.span>
          </div>
        </div>
      </div>
    </div>
  );
}
