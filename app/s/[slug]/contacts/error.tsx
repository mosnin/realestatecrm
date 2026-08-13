'use client';

import { motion } from 'framer-motion';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { H3, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { DASHBOARD_SURFACE } from '@/components/ui/surface-card';

export default function ContactsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="chippi-dashboard-canvas flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-10 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className={cn(DASHBOARD_SURFACE, 'max-w-md p-8 text-center sm:p-10')}
      >
        <h2 className={H3}>Your people didn&apos;t load</h2>
        <p className={cn(BODY_MUTED, 'mt-1.5')}>
          The connection hiccupped on the way to your contacts. It&apos;s almost always a passing
          thing.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Try again
        </button>
      </motion.div>
    </div>
  );
}
