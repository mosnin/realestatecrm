'use client';

/**
 * TourBookingAnimation
 *
 * Abstracts: "Reply with a time; Chippi books the tour."
 * A loose intention becoming a certain, scheduled moment.
 *
 * The beat (one ~6.4s loop):
 *   1. Two quiet points rest apart.             (0.0s)
 *   2. A fluid arc draws itself between them.    pathLength 0 -> 1
 *   3. One brand-orange pulse travels the arc.   point A -> point B
 *   4. A ring strokes closed around point B.     the booking locks in
 *   5. One soft confirm pulse breathes outward.  certainty
 *   6. Hold a beat, fade, repeat.
 *
 * The pulse is the ONLY brand-orange element. Everything else is neutral.
 * Reduced motion: the static END state — arc drawn, ring complete.
 */

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

// Apple easing. No spring, no bounce.
const EASE = [0.22, 1, 0.36, 1] as const;

// Geometry on a 0–100 square viewBox. A and B sit apart; the arc bows between.
const A = { x: 22, y: 64 };
const B = { x: 78, y: 38 };
const ARC = `M ${A.x} ${A.y} Q 50 14 ${B.x} ${B.y}`;
const RING_R = 9;

export function TourBookingAnimation({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  // One full cycle in seconds, carved into named beats.
  const DRAW = 1.4; // arc draws
  const TRAVEL = 1.5; // pulse rides the arc
  const RING = 1.0; // ring strokes closed
  const HOLD = 1.3; // the moment sits
  const FADE = 1.2; // everything fades out
  const CYCLE = DRAW + TRAVEL + RING + HOLD + FADE; // ~6.4s

  // Keyframe offsets (0–1) on the shared-clock timeline.
  const tDraw = DRAW / CYCLE;
  const tTravel = (DRAW + TRAVEL) / CYCLE;
  const tRing = (DRAW + TRAVEL + RING) / CYCLE;
  const tHold = (DRAW + TRAVEL + RING + HOLD) / CYCLE;

  const ink = 'var(--muted-foreground)';

  return (
    <div className={cn('relative h-full w-full', className)}>
      <svg viewBox="0 0 100 100" fill="none" className="h-full w-full" aria-hidden="true">
        {/* The two resting points — quiet neutral marks. */}
        <circle cx={A.x} cy={A.y} r={2.4} fill={ink} opacity={0.5} />
        <circle cx={B.x} cy={B.y} r={2.4} fill={ink} opacity={0.5} />

        {reduce ? (
          // Reduced motion: the finished moment, held still.
          <>
            <path d={ARC} stroke={ink} strokeWidth={1} strokeLinecap="round" opacity={0.55} />
            <circle cx={B.x} cy={B.y} r={RING_R} stroke="var(--brand)" strokeWidth={1.4} />
            <circle cx={B.x} cy={B.y} r={2.8} fill="var(--brand)" />
          </>
        ) : (
          <>
            {/* The arc draws itself, then fades with the rest. */}
            <motion.path
              d={ARC}
              stroke={ink}
              strokeWidth={1}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: [0, 1, 1, 1, 1, 0],
                opacity: [0, 0.55, 0.55, 0.55, 0.55, 0],
              }}
              transition={{
                duration: CYCLE,
                ease: EASE,
                times: [0, tDraw, tTravel, tRing, tHold, 1],
                repeat: Infinity,
              }}
            />

            {/* The ring strokes closed around B — the booking locking in. */}
            <motion.circle
              cx={B.x}
              cy={B.y}
              r={RING_R}
              stroke="var(--border)"
              strokeWidth={1.2}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: [0, 0, 0, 1, 1, 0],
                opacity: [0, 0, 0, 0.9, 0.9, 0],
              }}
              transition={{
                duration: CYCLE,
                ease: EASE,
                times: [0, tDraw, tTravel, tRing, tHold, 1],
                repeat: Infinity,
              }}
            />

            {/* One soft confirm pulse — certainty breathing outward, once. */}
            <motion.circle
              cx={B.x}
              cy={B.y}
              r={RING_R}
              stroke="var(--brand)"
              strokeWidth={1}
              style={{ transformOrigin: `${B.x}px ${B.y}px` }}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{
                scale: [0.7, 0.7, 0.7, 0.7, 1.7, 1.7],
                opacity: [0, 0, 0, 0.55, 0, 0],
              }}
              transition={{
                duration: CYCLE,
                ease: EASE,
                times: [0, tDraw, tTravel, tRing, tHold, 1],
                repeat: Infinity,
              }}
            />

            {/* The single brand-orange pulse: rides the arc A -> B, lands as the booked mark. */}
            <motion.circle
              r={2.8}
              fill="var(--brand)"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1, 1, 1, 0] }}
              transition={{
                duration: CYCLE,
                ease: 'linear',
                times: [0, tDraw, tDraw + 0.02, tRing, tHold, 1],
                repeat: Infinity,
              }}
            >
              {/* Rides the arc geometry during the TRAVEL beat, then rests at B. */}
              <animateMotion
                dur={`${CYCLE}s`}
                repeatCount="indefinite"
                keyPoints="0;0;1;1;1;1"
                keyTimes={`0;${tDraw};${tTravel};${tRing};${tHold};1`}
                calcMode="spline"
                keySplines={`0 0 1 1;${EASE.join(' ')};0 0 1 1;0 0 1 1;0 0 1 1`}
                path={ARC}
              />
            </motion.circle>
          </>
        )}
      </svg>
    </div>
  );
}
