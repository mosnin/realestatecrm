'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion';

export default function BrokerDealsError({ reset }: { error: Error; reset: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <motion.div
        className="text-center space-y-3 p-6"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
      >
        <AlertTriangle
          size={24}
          className="mx-auto text-muted-foreground/60"
          aria-hidden
        />
        <h2 className="text-base font-semibold">Couldn&apos;t load deals</h2>
        <p className="text-sm text-muted-foreground">Usually temporary.</p>
        <button
          onClick={reset}
          className="text-sm text-primary font-medium hover:underline underline-offset-2"
        >
          Try again
        </button>
      </motion.div>
    </div>
  );
}
