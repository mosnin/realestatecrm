'use client';

/**
 * Marketing page transition. A template remounts on every route change inside
 * the (marketing) group, so each page arrives with one smooth blur-in: a light
 * blur that resolves to crisp on a silky ease-out-expo curve. It is kept light
 * and transform-free on purpose, so it complements (rather than fights) the
 * per-section blur-rise entrances and never shifts layout or reveals a strip on
 * the light shell. Reduced-motion renders instantly.
 */

import { motion, useReducedMotion } from 'framer-motion';

export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, filter: 'blur(8px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], opacity: { duration: 0.45, ease: 'easeOut' } }}
      style={{ willChange: 'filter, opacity' }}
    >
      {children}
    </motion.div>
  );
}
