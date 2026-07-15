'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, CloudOff } from 'lucide-react';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { H3, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';

export default function BrokerRealtorsError({ reset }: { error: Error; reset: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="text-center max-w-sm"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.04]">
          <CloudOff size={20} strokeWidth={1.5} className="text-muted-foreground/60" />
        </div>
        <h2 className={H3}>Couldn&apos;t load realtors</h2>
        <p className={cn(BODY_MUTED, 'mt-1.5')}>Usually temporary.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <RotateCcw size={14} />
          Try again
        </button>
      </motion.div>
    </div>
  );
}
