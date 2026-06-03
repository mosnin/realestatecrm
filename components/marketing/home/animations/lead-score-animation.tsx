'use client';

import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

/**
 * LeadScoreAnimation — "Chippi knows which lead to call first."
 *
 * Abstract idea: signal rising from noise. A loose scatter of neutral dots
 * drifts in a field, then sorts itself — the single hottest dot warms to
 * brand-orange, swells, glows, and rises to the top, while the rest settle
 * into a calmer vertical hierarchy below. Hold a beat on the chosen one,
 * then re-scatter and repeat.
 *
 * CYCLE (~7.2s, looping):
 *   0.00–0.28  scatter   — dots drift loosely, all neutral, gentle breathing
 *   0.28–0.52  sort      — dots ease toward a ranked vertical order
 *   0.52–0.82  hold      — hot dot lifted, warm, glowing; others quiet below
 *   0.82–1.00  dissolve  — everything eases back into the loose scatter
 *
 * Apple easing only. One orange element. SVG viewBox = responsive + SSR-safe.
 */

// Apple easing curve.
const EASE = [0.22, 1, 0.36, 1] as const;
const CYCLE = 7.2;

// 100x100 viewBox. The first dot (index 0) is the chosen one.
type Dot = {
  // scatter position (loose, noisy field) + sorted position (ranked column)
  sx: number; sy: number; tx: number; ty: number;
  sr: number; tr: number; // radius scatter / sorted
};

// Sorted column sits center-x; the hot dot rests high, the rest fall in rank.
const DOTS: Dot[] = [
  { sx: 64, sy: 58, tx: 50, ty: 20, sr: 3.4, tr: 7.5 }, // chosen — rises, swells
  { sx: 28, sy: 30, tx: 50, ty: 42, sr: 4.2, tr: 3.4 },
  { sx: 76, sy: 26, tx: 50, ty: 54, sr: 2.8, tr: 3.0 },
  { sx: 38, sy: 70, tx: 50, ty: 64, sr: 3.6, tr: 2.7 },
  { sx: 70, sy: 74, tx: 50, ty: 73, sr: 2.4, tr: 2.4 },
  { sx: 20, sy: 54, tx: 50, ty: 81, sr: 3.0, tr: 2.1 },
  { sx: 52, sy: 40, tx: 50, ty: 88, sr: 2.6, tr: 1.9 },
];

// Keyframe times mapped to the four phases above.
const TIMES = [0, 0.28, 0.52, 0.82, 1];

export function LeadScoreAnimation({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  return (
    <div className={cn('relative h-full w-full', className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        {/* Faint baseline the ranked order eases toward — a whisper, not a grid. */}
        <line
          x1="50" y1="14" x2="50" y2="92"
          stroke="var(--border)"
          strokeWidth="0.4"
          strokeLinecap="round"
          opacity={reduced ? 0.5 : 0.28}
        />

        {DOTS.map((d, i) => {
          const isHot = i === 0;

          // Reduced motion: tasteful static END state (sorted, chosen one warm).
          if (reduced) {
            return (
              <g key={i}>
                {isHot && (
                  <circle cx={d.tx} cy={d.ty} r={d.tr * 2.1} fill="var(--brand)" opacity={0.14} />
                )}
                <circle
                  cx={d.tx}
                  cy={d.ty}
                  r={d.tr}
                  fill={isHot ? 'var(--brand)' : 'currentColor'}
                  className={isHot ? '' : 'text-muted-foreground'}
                  opacity={isHot ? 1 : 0.4}
                />
              </g>
            );
          }

          // x / y / r ride the four phases: scatter → sort → hold → dissolve.
          const cx = [d.sx, d.tx, d.tx, d.sx, d.sx];
          const cy = [d.sy, d.ty, d.ty, d.sy, d.sy];
          const r = [d.sr, d.tr, d.tr, d.sr, d.sr];

          // Neutral dots dim slightly while the chosen one holds the stage.
          const dimOpacity = isHot
            ? [0.85, 1, 1, 1, 0.85]
            : [0.5, 0.4, 0.32, 0.32, 0.5];

          return (
            <g key={i}>
              {/* Soft glow — only the chosen dot, fading up during sort/hold. */}
              {isHot && (
                <motion.circle
                  fill="var(--brand)"
                  initial={false}
                  animate={{
                    cx,
                    cy,
                    r: [d.sr * 1.6, d.tr * 2.2, d.tr * 2.4, d.sr * 1.6, d.sr * 1.6],
                    opacity: [0, 0.16, 0.2, 0, 0],
                  }}
                  transition={{
                    duration: CYCLE,
                    times: TIMES,
                    ease: EASE,
                    repeat: Infinity,
                  }}
                />
              )}

              <motion.circle
                fill={isHot ? 'var(--brand)' : 'currentColor'}
                className={isHot ? '' : 'text-muted-foreground'}
                initial={false}
                animate={{ cx, cy, r, opacity: dimOpacity }}
                transition={{
                  duration: CYCLE,
                  times: TIMES,
                  ease: EASE,
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
