'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { H3, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { BROKER_CONTROL, BROKER_PANEL } from '@/components/broker/premium';

export default function BrokerUsageError({ reset }: { error: Error; reset: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6" data-broker-premium-state="error">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className={cn(BROKER_PANEL, 'w-full max-w-sm text-center')}
      >
        <h2 className={H3}>Couldn&apos;t load usage</h2>
        <p className={cn(BODY_MUTED, 'mt-1.5')}>Usually temporary.</p>
        <button
          type="button"
          onClick={reset}
          className={cn(BROKER_CONTROL, 'mt-5 gap-1.5')}
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </motion.div>
    </div>
  );
}
