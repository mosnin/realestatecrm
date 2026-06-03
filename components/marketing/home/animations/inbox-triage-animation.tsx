'use client';

/**
 * `<InboxTriageAnimation>` — an abstract, looping marketing animation for
 * the Chippi homepage. It does NOT recreate any product UI. It abstracts a
 * single idea with primitive geometry:
 *
 *   "Chippi reads the flood and surfaces what matters."
 *
 * The picture: a steady field of thin neutral bars drifts upward like a
 * rising tide of noise. Most of them stay faint and recede. Every few
 * seconds ONE bar is chosen — it eases forward into focus (lengthens,
 * brightens to foreground, gains a single scarce brand-orange dot at its
 * head) and holds in stillness while the rest blur back. Then it releases
 * and the next one is chosen. An overwhelming inbox quietly becoming a
 * single clear "look at this."
 *
 * Motion contract: Apple easing only, no spring/bounce, continuous loop,
 * exactly ONE orange element at a time, honors prefers-reduced-motion with a
 * static end state. Pure SVG geometry, no assets, SSR-safe, fills its parent.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

// Apple easing — the only two curves the system allows.
const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_SOFT = [0.16, 1, 0.3, 1] as const;

// The field. Bars are laid out on a 100x100 viewBox, drifting bottom→top.
const BAR_COUNT = 14;
const ROW_GAP = 100 / (BAR_COUNT + 1); // even vertical rhythm
const DRIFT_PERIOD = 7; // seconds for one bar to travel the full field
const FOCUS_HOLD = 2.4; // seconds the chosen bar stays in focus

// Deterministic pseudo-random so SSR and client agree (no hydration drift).
function jitter(i: number, salt: number) {
  const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

interface BarProps {
  index: number;
  chosen: boolean;
  reduced: boolean;
}

/**
 * One bar. In the steady state it drifts upward on an infinite loop, faint
 * and short — noise settling. When `chosen`, it interrupts the drift to ease
 * FORWARD: it grows, brightens, and parks mid-field while everything else
 * recedes. The orange head-dot rides only on the chosen bar.
 */
function Bar({ index, chosen, reduced }: BarProps) {
  // Each bar gets a stable lane width, x-offset and phase so the field reads
  // as organic rather than a grid.
  const lane = 26 + jitter(index, 1) * 30; // base length of a noise bar
  const x = 14 + jitter(index, 2) * 8; // left inset
  const y = ROW_GAP * (index + 1);
  const phase = jitter(index, 3); // staggers the drift so bars don't march

  if (reduced) {
    // Static end state: the field at rest, the chosen bar already in focus.
    return (
      <g opacity={chosen ? 1 : 0.18}>
        <rect
          x={x}
          y={y - (chosen ? 0.9 : 0.5)}
          width={chosen ? 58 : lane}
          height={chosen ? 1.8 : 1}
          rx={0.9}
          fill="var(--foreground)"
        />
        {chosen && (
          <circle cx={x + 58 + 3} cy={y} r={1.8} fill="var(--brand)" />
        )}
      </g>
    );
  }

  return (
    <g>
      {/* The drifting noise bar. It rises continuously and fades as it goes.
          When this bar is the chosen one it dims out of the way so the focus
          layer below reads cleanly. */}
      <motion.rect
        x={x}
        y={y}
        height={1}
        rx={0.5}
        fill="var(--foreground)"
        initial={false}
        animate={{
          y: [y + 6, y - 6],
          width: [lane * 0.85, lane],
          opacity: chosen ? 0.06 : [0.04, 0.2, 0.1],
        }}
        transition={{
          duration: DRIFT_PERIOD,
          ease: EASE_SOFT,
          repeat: Infinity,
          delay: -phase * DRIFT_PERIOD, // negative delay = mid-flight start
          opacity: chosen
            ? { duration: 0.6, ease: EASE }
            : {
                duration: DRIFT_PERIOD,
                ease: EASE_SOFT,
                repeat: Infinity,
                delay: -phase * DRIFT_PERIOD,
              },
        }}
      />

      {/* The focus layer — only visible on the chosen bar. It eases forward:
          longer, brighter, parked still at the bar's row. Everything in this
          group fades to nothing the instant the bar is no longer chosen. */}
      <motion.g
        initial={false}
        animate={{ opacity: chosen ? 1 : 0 }}
        transition={{ duration: chosen ? 0.7 : 0.45, ease: EASE }}
      >
        <motion.rect
          x={x}
          y={y - 0.9}
          height={1.8}
          rx={0.9}
          fill="var(--foreground)"
          initial={false}
          animate={{ width: chosen ? 58 : lane }}
          transition={{ duration: 0.8, ease: EASE }}
        />
        {/* The one scarce brand-orange element. A small dot at the head of the
            chosen bar — the "look at this." Eases in just after the bar
            brightens, so the eye lands on the line first, then the mark. */}
        <motion.circle
          cy={y}
          r={1.8}
          fill="var(--brand)"
          initial={false}
          animate={{
            cx: chosen ? x + 58 + 3 : x + lane + 3,
            opacity: chosen ? 1 : 0,
            scale: chosen ? 1 : 0.4,
          }}
          transition={{
            duration: 0.7,
            ease: EASE,
            delay: chosen ? 0.18 : 0,
          }}
        />
      </motion.g>
    </g>
  );
}

export interface InboxTriageAnimationProps {
  className?: string;
}

export function InboxTriageAnimation({ className }: InboxTriageAnimationProps) {
  const reduced = useReducedMotion() ?? false;

  // The cycle: rotate which bar is "chosen". Exactly one at a time, ever.
  // We step by 5 each tick so the focus appears to wander the field rather
  // than crawl row by row.
  const [chosen, setChosen] = useState(reduced ? Math.floor(BAR_COUNT / 2) : 4);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setChosen((c) => (c + 5) % BAR_COUNT);
    }, FOCUS_HOLD * 1000);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Many faint lines drift upward while Chippi surfaces a single clear one."
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <Bar key={i} index={i} chosen={i === chosen} reduced={reduced} />
      ))}
    </svg>
  );
}
