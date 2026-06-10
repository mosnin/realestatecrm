'use client';

/**
 * Reveal — the one motion primitive the calm site uses.
 *
 * A single fade + small rise as a block scrolls into view, on the product's
 * EASE_OUT curve. This is the ONLY animation vocabulary on the logged-out
 * site now: no parallax, no 3D tilt, no cursor-glow, no scroll-progress bar.
 * The restraint is the brand — the same restraint the product runs on.
 *
 * Honors prefers-reduced-motion: those users get the content instantly, no
 * dead air, no transform.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT, DURATION_SLOW } from '@/lib/motion';

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: DURATION_SLOW, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
