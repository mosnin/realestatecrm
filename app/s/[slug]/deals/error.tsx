'use client';

import { motion } from 'framer-motion';
import { RotateCcw, TrendingUp } from 'lucide-react';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { H3, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';

export default function DealsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div data-realtor-page="today" className="chippi-dashboard-canvas flex min-h-[calc(100vh-10rem)] items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="text-center max-w-sm"
      >
        <h2 className={H3}>Your pipeline didn&apos;t load</h2>
        <p className={cn(BODY_MUTED, 'mt-1.5')}>
          The board hiccupped on its way in. Your deals are safe — this is almost
          always a passing thing.
        </p>
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
