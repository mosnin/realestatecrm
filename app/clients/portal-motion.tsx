'use client';

/**
 * Portal motion primitives — the client-side animation layer for the
 * client/buyer portal. Server pages (dashboard, application detail, book)
 * stay RSC; they wrap their sections in these small client components to
 * get the same calm, purposeful motion the realtor-facing Chippi surfaces
 * and the public intake already use.
 *
 * Why a dedicated file: the portal pages are server components and can't
 * call framer-motion hooks directly. These thin wrappers keep the motion
 * vocabulary in one place and — critically — every one of them respects
 * prefers-reduced-motion via framer's `useReducedMotion`, so a lead who
 * has asked their OS to calm down gets a clean, instant render with no
 * translate/scale, exactly per the Apple accessibility bar.
 *
 * The tokens (EASE_OUT, DURATION_BASE, stagger cadence) come from
 * lib/motion so the portal breathes on the same curves as everything else.
 */

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  DURATION_BASE,
  EASE_OUT,
  CHAT_STAGGER_DELAY,
} from '@/lib/motion';

/**
 * Page entrance — a quiet fade + 6px rise for a whole page region. Use
 * once near the top of a portal page (header block). Reduced-motion →
 * opacity-only so the content still arrives, just without movement.
 */
export function PortalFadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered list reveal — a `<ul>` whose row children rise in sequence.
 * Renders real list semantics (ul/li via `PortalStaggerItem`) so screen
 * readers still announce "list, N items"; the motion is purely visual.
 * The 40ms cadence is the Apple step the rest of the app uses, not the
 * 100ms that reads as "animation". Reduced-motion collapses the stagger
 * (rows appear together, no translate).
 */
export function PortalStagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      initial="initial"
      animate="enter"
      variants={{
        initial: {},
        enter: {
          transition: { staggerChildren: reduce ? 0 : CHAT_STAGGER_DELAY },
        },
      }}
      className={className}
    >
      {children}
    </motion.ul>
  );
}

/** A single `<li>` row inside `PortalStagger`. */
export function PortalStaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      variants={{
        initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
        enter: {
          opacity: 1,
          y: 0,
          transition: { duration: DURATION_BASE, ease: EASE_OUT },
        },
      }}
      className={className}
    >
      {children}
    </motion.li>
  );
}
