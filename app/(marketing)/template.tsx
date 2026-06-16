'use client';

/**
 * Marketing page transition. A template remounts on every route change inside
 * the (marketing) group, so each page arrives with one subtle blur-in: the
 * content fades up from a soft blur to crisp. It wraps only the page content
 * (the fixed header/footer live outside it), so the chrome stays sharp while
 * the page resolves. Reduced-motion renders instantly, and animating `filter`
 * never shifts layout.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, filter: 'blur(12px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      style={{ willChange: 'filter, opacity' }}
    >
      {children}
    </motion.div>
  );
}
