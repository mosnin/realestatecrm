'use client';

/**
 * Marketing page transition, a template remounts on every route change
 * inside the (marketing) group, so each page arrives with one subtle
 * fade-rise. Quiet by design (no exit choreography, no layout shift risk);
 * reduced-motion renders instantly.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
