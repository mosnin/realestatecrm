'use client';

/**
 * Reveal — the site's one motion primitive.
 *
 * A single fade + small slide as a block scrolls into view, on the product's
 * EASE_OUT curve. Supports a direction so feature rows can rise, or slide in
 * from the side they sit on (editorial rhythm) without each section
 * hand-rolling motion. Honors prefers-reduced-motion: instant, no transform.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT, DURATION_SLOW } from '@/lib/motion';

type From = 'bottom' | 'left' | 'right';

const OFFSET: Record<From, { x?: number; y?: number }> = {
  bottom: { y: 16 },
  left: { x: -28 },
  right: { x: 28 },
};

export function Reveal({
  children,
  delay = 0,
  from = 'bottom',
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: From;
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const offset = OFFSET[from];

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: DURATION_SLOW, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
