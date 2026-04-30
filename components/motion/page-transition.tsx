'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { PAGE_VARIANTS } from '@/lib/motion';

/**
 * Wraps page children with a fade + tiny y-translate on route change.
 * Mounts inside the workspace `<main>` so the chrome (header / sidebar)
 * doesn't re-animate on every nav.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
