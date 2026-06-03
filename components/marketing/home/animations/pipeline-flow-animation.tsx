'use client';

import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

/**
 * PipelineFlowAnimation — "The pipeline keeps itself current."
 *
 * Abstract geometry only: one horizontal track, four neutral node-dots
 * (stages), and a single brand-orange token that glides stage to stage.
 * As the token passes each node, the node wakes (soft scale + brighten)
 * then settles — the board updating itself in the token's wake.
 *
 * Cycle (~6.4s, looping):
 *   0.00–0.78  token glides across the full track, left → right
 *   (each node responds the instant the token reaches it)
 *   0.78–0.94  token rests at the end; track holds in sync for a beat
 *   0.94–1.00  token fades out and resets for a seamless loop
 *
 * Exactly one orange element (the token). Everything else is neutral.
 */

// Apple easing — no spring, no bounce, no linear.
const EASE = [0.22, 1, 0.36, 1] as const;
const CYCLE = 6.4;

// Four evenly-spaced stages on a 0–100 viewBox track.
const NODES = [14, 38, 62, 86];
const FIRST = NODES[0];
const LAST = NODES[NODES.length - 1];
const SPAN = LAST - FIRST;
const TRACK_Y = 50;
// Fraction of the cycle the token spends travelling (rest of cycle = hold).
const TRAVEL = 0.78;
// When (as a fraction of the whole cycle) the token reaches each node.
const ARRIVAL = NODES.map((x) => ((x - FIRST) / SPAN) * TRAVEL);

export function PipelineFlowAnimation({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn('relative h-full w-full', className)}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        {/* Track hairline — the neutral spine the pipeline rides on. */}
        <line
          x1={FIRST}
          y1={TRACK_Y}
          x2={LAST}
          y2={TRACK_Y}
          stroke="var(--border)"
          strokeWidth={0.6}
          strokeLinecap="round"
        />

        {/* Node-dots — the stages. Each wakes as the token passes. */}
        {NODES.map((x, i) => {
          const at = ARRIVAL[i];
          return (
            <motion.circle
              key={x}
              cx={x}
              cy={TRACK_Y}
              r={2.4}
              fill="var(--card)"
              stroke="rgba(120,120,128,0.45)"
              strokeWidth={0.6}
              style={{ transformOrigin: `${x}px ${TRACK_Y}px` }}
              initial={false}
              animate={
                reduce
                  ? { scale: 1.08, opacity: 1 }
                  : {
                      // Rest, swell to meet the token, settle current.
                      scale: [1, 1, 1.32, 1.08],
                      opacity: [0.55, 0.55, 1, 0.78],
                    }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      duration: CYCLE,
                      ease: EASE,
                      repeat: Infinity,
                      // Keyframes land just before / at the token's arrival.
                      times: [0, Math.max(at - 0.06, 0), at, 1],
                    }
              }
            />
          );
        })}

        {/* The token — the ONLY orange. Forward momentum made visible. */}
        <motion.g
          initial={false}
          animate={
            reduce
              ? { x: SPAN, opacity: 1 }
              : { x: [0, SPAN, SPAN, SPAN], opacity: [0, 1, 1, 0] }
          }
          transition={
            reduce
              ? { duration: 0 }
              : {
                  duration: CYCLE,
                  ease: EASE,
                  repeat: Infinity,
                  // Glide, hold at the end, then fade for a seamless loop.
                  times: [0, TRAVEL, 0.94, 1],
                }
          }
          style={{ transformBox: 'fill-box' }}
        >
          {/* Soft halo trailing the token — momentum, not a hard edge. */}
          <circle cx={FIRST} cy={TRACK_Y} r={5} fill="var(--brand)" opacity={0.16} />
          <circle cx={FIRST} cy={TRACK_Y} r={2.1} fill="var(--brand)" />
        </motion.g>
      </svg>
    </div>
  );
}
