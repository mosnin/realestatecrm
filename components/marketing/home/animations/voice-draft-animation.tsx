'use client';

/**
 * VoiceDraftAnimation — "Chippi drafts the reply, in your voice."
 *
 * Abstract idea: a single continuous line draws itself left-to-right into
 * flowing, handwriting-like strokes — a thought becoming language. A small
 * brand-orange dot leads the stroke like a pen tip. When the line completes
 * it settles, a soft brand glow pulses once, then the whole phrase gently
 * dissolves (fade + slight blur) and the cycle redraws.
 *
 * Cycle (~7.2s), Apple easing only, looping:
 *   0.00 → 0.62  draw      pen tip traces the stroke, pathLength 0 → 1
 *   0.62 → 0.74  settle    line at rest, pen tip fades out
 *   0.74 → 0.84  glow      brand glow swells once, then releases
 *   0.84 → 1.00  dissolve  stroke fades + blurs away, ready to redraw
 *
 * Everything is neutral except the single brand-orange pen tip (and the
 * brief glow it leaves behind) — orange is scarce and earned.
 */

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

// Apple easing — calm, decisive, no overshoot.
const EASE = [0.22, 1, 0.36, 1] as const;

// One flowing, handwriting-like phrase: two "words" of loose cursive on a
// gentle baseline — primitive geometry, never real letters.
const STROKE =
  'M 36 96 C 58 70 70 70 78 96 C 86 122 98 122 106 96 C 116 66 132 64 140 96 ' +
  'C 146 120 152 124 168 104 C 184 84 196 100 196 100 ' +
  'M 224 96 C 246 70 258 70 266 96 C 274 122 286 122 294 96 ' +
  'C 304 66 320 64 328 96 C 334 118 342 124 356 108 C 372 90 392 96 416 88';

const CYCLE = 7.2; // seconds — full loop duration

export function VoiceDraftAnimation({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn('relative h-full w-full', className)}>
      <svg
        viewBox="0 0 452 192"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        {/* Hairline baseline — quiet structure the phrase rests on. */}
        <line
          x1="36"
          y1="150"
          x2="416"
          y2="150"
          stroke="var(--border)"
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* The glow the finished phrase leaves behind — the only other orange,
            and it only ever exists for a single beat after the line settles. */}
        {!reduce && (
          <motion.path
            d={STROKE}
            stroke="var(--brand)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'blur(6px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0, 0.5, 0, 0, 0] }}
            transition={{
              duration: CYCLE,
              ease: EASE,
              times: [0, 0.62, 0.74, 0.8, 0.86, 0.94, 1],
              repeat: Infinity,
            }}
          />
        )}

        {/* The phrase itself — neutral. Draws in, settles, then dissolves. */}
        <motion.path
          d={STROKE}
          stroke="var(--foreground)"
          strokeOpacity={0.82}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(reduce
            ? {
                // Reduced motion: tasteful static END state — fully drawn, calm.
                initial: false as const,
                animate: { pathLength: 1, opacity: 1, filter: 'blur(0px)' },
              }
            : {
                initial: { pathLength: 0, opacity: 1, filter: 'blur(0px)' },
                animate: {
                  pathLength: [0, 1, 1, 1, 0, 0],
                  opacity: [1, 1, 1, 1, 0, 0],
                  filter: [
                    'blur(0px)',
                    'blur(0px)',
                    'blur(0px)',
                    'blur(0px)',
                    'blur(3px)',
                    'blur(3px)',
                  ],
                },
                transition: {
                  duration: CYCLE,
                  ease: EASE,
                  times: [0, 0.62, 0.74, 0.84, 0.96, 1],
                  repeat: Infinity,
                },
              })}
        />

        {/* Pen tip — the one true brand-orange element. Rides the stroke as it
            draws, then fades the instant the phrase settles. */}
        {!reduce && (
          <motion.circle
            r={4.5}
            fill="var(--brand)"
            initial={{ opacity: 0, offsetDistance: '0%' }}
            animate={{
              opacity: [0, 1, 1, 0, 0, 0],
              offsetDistance: ['0%', '0%', '100%', '100%', '100%', '100%'],
            }}
            transition={{
              duration: CYCLE,
              ease: EASE,
              times: [0, 0.04, 0.62, 0.7, 0.96, 1],
              repeat: Infinity,
            }}
            style={{
              offsetPath: `path('${STROKE}')`,
              offsetRotate: '0deg',
            }}
          />
        )}
      </svg>
    </div>
  );
}

export default VoiceDraftAnimation;
