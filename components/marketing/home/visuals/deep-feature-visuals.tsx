'use client';

/**
 * Deep-feature homepage visuals — pure abstract geometry, no product UI.
 *
 * Two ideas, each told in one loop with exactly one orange element:
 *   - CommandPulseVisual: "Speak; your workspace responds." A single orange
 *     pulse leaves a point and the calm field of rings answers it.
 *   - ApprovalGateVisual: "Approval-first, always." A token waits at a line;
 *     one orange beat releases it through. The pause is the point.
 *
 * Tokens only (light + dark). Brand orange via `var(--brand)`, neutrals via
 * `currentColor` driven by `text-*` classes, hairlines via `var(--border)`.
 * Reduced motion → static, settled end state. SSR-safe (no measurement).
 */

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

// Apple out-quint — the same settle the product uses for arrivals.
const EASE_APPLE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* CommandPulseVisual                                                  */
/* ------------------------------------------------------------------ */

const RINGS = [34, 58, 82, 106, 130];

export function CommandPulseVisual({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn('relative aspect-video w-full', className)}>
      <svg
        viewBox="0 0 320 180"
        className="absolute inset-0 h-full w-full text-muted-foreground"
        fill="none"
        aria-hidden
      >
        {/* Calm field — concentric rings answering the command. */}
        {RINGS.map((r, i) => (
          <motion.circle
            key={r}
            cx={160}
            cy={90}
            r={r}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.14}
            initial={false}
            animate={
              reduce
                ? { opacity: 0.14 }
                : {
                    opacity: [0.1, 0.26, 0.1],
                    scale: [1, 1.012, 1],
                  }
            }
            style={{ transformOrigin: '160px 90px' }}
            transition={{
              duration: 6.5,
              ease: 'easeInOut',
              repeat: Infinity,
              delay: i * 0.42,
            }}
          />
        ))}

        {/* The point that speaks. */}
        <circle cx={160} cy={90} r={3} fill="currentColor" opacity={0.5} />

        {/* The single orange pulse — travels out, then the field settles. */}
        <motion.circle
          cx={160}
          cy={90}
          stroke="var(--brand)"
          strokeWidth={1.5}
          fill="none"
          initial={false}
          animate={
            reduce
              ? { r: 130, opacity: 0 }
              : { r: [4, 142], opacity: [0, 0.9, 0] }
          }
          transition={{
            duration: 6.5,
            ease: EASE_APPLE,
            repeat: Infinity,
            times: [0, 0.06, 0.62],
            repeatDelay: 0,
          }}
        />

        {/* A bright orange core breath at the source — the spoken word. */}
        {!reduce && (
          <motion.circle
            cx={160}
            cy={90}
            r={3}
            fill="var(--brand)"
            initial={false}
            animate={{ opacity: [0, 1, 0], scale: [0.6, 1.8, 0.6] }}
            style={{ transformOrigin: '160px 90px' }}
            transition={{
              duration: 6.5,
              ease: 'easeInOut',
              repeat: Infinity,
              times: [0, 0.05, 0.3],
            }}
          />
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ApprovalGateVisual                                                  */
/* ------------------------------------------------------------------ */

export function ApprovalGateVisual({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  // Token path: glides in from left, holds at the gate, then passes through.
  const xKeys = reduce ? [232] : [44, 150, 150, 150, 232];
  const xTimes = [0, 0.22, 0.5, 0.62, 0.82];

  return (
    <div className={cn('relative aspect-video w-full', className)}>
      <svg
        viewBox="0 0 320 180"
        className="absolute inset-0 h-full w-full text-muted-foreground"
        fill="none"
        aria-hidden
      >
        {/* The track the token rides — a faint guide line. */}
        <line
          x1={28}
          y1={90}
          x2={292}
          y2={90}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 6"
          opacity={0.18}
        />

        {/* The gate — a single vertical line. Nothing leaves without the tap. */}
        <line
          x1={160}
          y1={42}
          x2={160}
          y2={138}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.45}
        />

        {/* The orange confirming beat — one pulse on the gate that releases it. */}
        <motion.line
          x1={160}
          y1={42}
          x2={160}
          y2={138}
          stroke="var(--brand)"
          strokeWidth={1.5}
          initial={false}
          animate={
            reduce
              ? { opacity: 0 }
              : { opacity: [0, 0, 0.95, 0, 0], scaleY: [1, 1, 1.06, 1, 1] }
          }
          style={{ transformOrigin: '160px 90px' }}
          transition={{
            duration: 7.5,
            ease: 'easeInOut',
            repeat: Infinity,
            times: [0, 0.5, 0.56, 0.64, 1],
          }}
        />

        {/* The token — arrives, waits, passes. Neutral; the gate is the star. */}
        <motion.circle
          cy={90}
          r={6}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.8}
          initial={false}
          animate={
            reduce
              ? { cx: 232, opacity: 0.8 }
              : { cx: xKeys, opacity: [0, 0.85, 0.85, 0.85, 0.85] }
          }
          transition={{
            duration: 7.5,
            ease: EASE_APPLE,
            repeat: Infinity,
            times: xTimes,
          }}
        />
      </svg>
    </div>
  );
}
