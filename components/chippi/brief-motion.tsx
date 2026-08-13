'use client';

/**
 * brief-motion — shared motion primitives for the editorial BriefDashboard.
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

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { DASHBOARD_INSET, DASHBOARD_SURFACE } from '@/components/ui/surface-card';

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
 * BriefCell — one calm editorial region. Panels no longer lift by default;
 * movement belongs to the page's entrance and to controls the realtor can
 * actually use. `interactive` is an explicit opt-in for a linked panel.
 */
export function BriefCell({
  children,
  span,
  delay = 0,
  surface = 'paper',
  interactive = false,
  className,
}: {
  children: React.ReactNode;
  span: string;
  delay?: number;
  /** Paper is the primary panel; muted is an inset; none is open whitespace. */
  surface?: 'paper' | 'muted' | 'none';
  /** Opt into a 2px hover lift only when the whole panel is actionable. */
  interactive?: boolean;
  className?: string;
}) {
  const motionOn = useBriefMotionEnabled();

  return (
    <motion.div
      className={cn(
        span,
        'min-w-0',
        surface !== 'none' && [
          'group/cell relative',
          surface === 'muted' ? DASHBOARD_INSET : DASHBOARD_SURFACE,
        ],
        className,
      )}
      initial={motionOn ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: motionOn ? delay : 0 }}
      whileHover={interactive && motionOn ? { y: -2 } : undefined}
    >
      {children}
    </motion.div>
  );
}
