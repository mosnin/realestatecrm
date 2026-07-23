'use client';

/**
 * <ThinkingOrb> — Chippi's living mark in the chat. A small sunset-gradient
 * orb that reflects what Chippi is doing right now:
 *   - listening : idle / waiting on you — a slow, calm breathing pulse.
 *   - thinking  : mid-turn, reasoning — a gentle rotating sheen.
 *   - solving   : actively working / running a tool — a faster, brighter
 *                 double-swirl with a tighter glow ("leaning in").
 *   - idle      : settled history rows — a still orb, no motion.
 *
 * Replaces the flat /chip-avatar.png in the transcript so the avatar itself
 * is the status signal. framer-motion drives it (self-contained, no global
 * CSS); prefers-reduced-motion collapses every state to the still orb.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type OrbState = 'listening' | 'thinking' | 'solving' | 'idle';

const SPEED: Record<OrbState, number> = {
  idle: 0,
  listening: 0, // pulse, not rotation
  thinking: 8,
  solving: 3.2,
};

export function ThinkingOrb({
  state = 'idle',
  size = 28,
  className,
}: {
  state?: OrbState;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const active = !reduce && state !== 'idle';
  const spin = SPEED[state];
  const solving = state === 'solving';

  return (
    <div
      className={cn('relative shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Chippi — ${state}`}
    >
      {/* Base sphere: bright sunset core → deep orange rim, with a top-left
          specular highlight for a real orb read. */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(120% 120% at 32% 28%, #ffe6bf 0%, #ffc266 22%, #ff9f0a 48%, #ff6a00 74%, #c43e00 100%)',
          boxShadow: 'inset 0 0 6px rgba(120,40,0,0.35)',
        }}
      />

      {/* Rotating sheen — a soft light band sweeping the orb (thinking/solving). */}
      {active && spin > 0 && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.55) 40deg, transparent 110deg, transparent 360deg)',
            mixBlendMode: 'soft-light',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: spin, ease: 'linear', repeat: Infinity }}
        />
      )}

      {/* Solving adds a second, faster, counter-rotating hot band. */}
      {active && solving && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 180deg, transparent 0deg, rgba(255,220,160,0.7) 30deg, transparent 90deg, transparent 360deg)',
            mixBlendMode: 'screen',
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: spin * 0.62, ease: 'linear', repeat: Infinity }}
        />
      )}

      {/* Listening: a calm breathing highlight (no rotation). */}
      {!reduce && state === 'listening' && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(closest-side, rgba(255,240,210,0.6), transparent 70%)',
          }}
          animate={{ opacity: [0.35, 0.85, 0.35], scale: [0.9, 1.03, 0.9] }}
          transition={{ duration: 2.8, ease: 'easeInOut', repeat: Infinity }}
        />
      )}

      {/* Outer glow — steady; tighter + brighter while solving. */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: solving
            ? '0 0 10px 1px rgba(255,138,10,0.5), 0 0 20px 3px rgba(255,106,0,0.28)'
            : active
              ? '0 0 8px 1px rgba(255,138,10,0.34), 0 0 16px 2px rgba(255,106,0,0.16)'
              : '0 0 6px 0 rgba(255,138,10,0.22)',
          transition: 'box-shadow 0.4s ease',
        }}
      />
    </div>
  );
}
