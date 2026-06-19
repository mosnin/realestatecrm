'use client';

/**
 * brief-motion — shared motion primitives for the BriefDashboard bento.
 *
 * Small, dependency-free helpers that give every cell on the daily brief
 * the same confident entrance + hover language WITHOUT inventing new
 * tokens. Durations + easing come straight from lib/motion (EASE_OUT,
 * DURATION_BASE); the palette stays neutral (border-border/70, bg-card).
 *
 * Everything here respects `prefers-reduced-motion`: when the OS flag is
 * set, entrances paint instantly and hover transforms collapse to a quiet
 * border tint, so the surface still reads as alive without movement.
 *
 * Nothing here changes data, links, counts, or actions — it is the motion
 * envelope the existing cells render INTO.
 */

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

/**
 * Reduced-motion-aware hook. Returns true only after mount on the client,
 * so SSR + first paint never assume motion is off (avoids a flash of the
 * static frame for motion users). Defaults to allowing motion.
 */
export function useBriefMotionEnabled(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Before mount we can't read the media query reliably; allow motion so
  // the entrance stagger plays. After mount, honor the OS setting.
  return !mounted || !reduce;
}

/**
 * BriefCell — the bento card frame.
 *
 * Replaces the old inline `BentoCell`: same span + plain-vs-card chrome,
 * but adds a barely-there hover lift (2px rise + border brighten) on
 * card cells. The lift is suppressed under reduced motion (the border
 * still warms so hover stays legible). Entrance is the same EASE_OUT
 * fade-up the original used, gated by reduced-motion.
 */
export function BriefCell({
  children,
  span,
  delay = 0,
  plain = false,
  className,
}: {
  children: React.ReactNode;
  span: string;
  delay?: number;
  /** Plain cells skip the card chrome (border + bg) — used for the greeting
   *  so the hero line reads as the page's voice, not a boxed stat. */
  plain?: boolean;
  className?: string;
}) {
  const motionOn = useBriefMotionEnabled();

  return (
    <motion.div
      className={cn(
        span,
        'min-w-0',
        !plain && [
          'group/cell relative rounded-xl border border-border/70 bg-card',
          // Hover: hairline brightens + an almost-imperceptible surface lift.
          // No shadow bloom — the brief stays paper-flat; the border carries
          // the affordance, matching the rest of Chippi.
          'transition-colors duration-200 hover:border-border',
        ],
        className,
      )}
      initial={motionOn ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: motionOn ? delay : 0 }}
      whileHover={!plain && motionOn ? { y: -2 } : undefined}
    >
      {children}
    </motion.div>
  );
}
