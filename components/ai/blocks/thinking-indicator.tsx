'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Thinking indicator for the Chippi chat transcript. Shimmer "Thinking" line
 * with a count-up timer, plus a slim card that surfaces the agent's most-
 * recent action as plain English ("Searching contacts…", "Drafting email…").
 *
 * Adapted from a generic chain-of-thought block. We deliberately don't show
 * raw model reasoning tokens — they leak implementation detail and read as
 * weird. Showing what the agent is DOING (tool calls) is the realtor-honest
 * version of "what's happening right now."
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
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Default placeholder while no tool has fired. Voice matches the rest of
  // the brand — first-person, calm, period.
  const action = currentAction?.trim() || 'Looking it over.';

  return (
    <div className={cn('flex flex-col gap-2.5 max-w-xl', className)}>
      {/* Shimmer line + timer */}
      <div className="flex items-center gap-2 text-sm">
        <Loader2 size={14} className="text-muted-foreground/70 animate-spin flex-shrink-0" />
        <span
          aria-live="polite"
          className="bg-[linear-gradient(110deg,hsl(var(--muted-foreground)),35%,hsl(var(--foreground)),50%,hsl(var(--muted-foreground)),75%,hsl(var(--muted-foreground)))] bg-[length:200%_100%] bg-clip-text text-transparent"
          style={{
            animation: 'chippi-thinking-shimmer 4s linear infinite',
            fontFamily: 'var(--font-title), serif',
          }}
        >
          Thinking
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{seconds}s</span>
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
            className="px-3 py-2.5 text-[13px] leading-relaxed text-foreground/85"
          >
            {action}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
