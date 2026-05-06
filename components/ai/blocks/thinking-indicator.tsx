'use client';

import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Thinking indicator for the Chippi chat transcript. Three staggered dots
 * signal "in progress" without quantifying the wait, plus a slim card that
 * surfaces the agent's most-recent action as plain English ("Searching
 * contacts…", "Drafting email…").
 *
 * We deliberately don't show raw model reasoning tokens — they leak
 * implementation detail and read as weird. Showing what the agent is DOING
 * (tool calls) is the realtor-honest version of "what's happening right now."
 *
 * Mounted by chippi-workspace.tsx when `showThinking` is true (an assistant
 * message is streaming but no blocks have landed yet). The current-action
 * line accepts an optional string from the parent — defaults to a calm
 * placeholder when no tool has fired yet.
 */
export function ThinkingIndicator({
  currentAction,
  className,
}: {
  /** Plain-English summary of what Chippi is doing right now. */
  currentAction?: string | null;
  className?: string;
}) {
  // Default placeholder while no tool has fired. Voice matches the rest of
  // the brand — first-person, calm, period.
  const action = currentAction?.trim() || 'Looking it over.';

  return (
    <div className={cn('flex flex-col gap-2.5 max-w-xl', className)}>
      {/* Three staggered dots — communicate "in progress" without a count */}
      <div className="flex gap-1 items-center" aria-label="Thinking" role="status">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-[3px] h-[3px] rounded-full bg-foreground/40"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
          />
        ))}
      </div>

      {/* Current-action card — fades + slides on each new action so the realtor
          sees the agent narrate its own work in plain English. */}
      <div
        className="relative overflow-hidden rounded-md border border-border/60 bg-foreground/[0.02]"
        style={{ minHeight: 38 }}
      >
        {/* Top + bottom fade overlays for the slide-in animation */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-background/40 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-background/40 to-transparent z-10" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={action}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="px-3 py-2.5 text-[13px] leading-relaxed text-foreground"
          >
            {action}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
