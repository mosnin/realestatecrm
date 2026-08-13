'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChainOfThought } from '@/components/ai/prompt-kit';
import {
  AgentProgress,
  ReasoningText,
  ThinkingShimmer,
} from '@/components/ai/agent-status';
import {
  DURATION_BASE,
  DURATION_FAST,
  EASE_OUT,
} from '@/lib/motion';

/**
 * Thinking indicator shown while Chippi is mid-turn.
 *
 * The whole indicator is one alive line. The pre-grounded "Thinking…" label
 * uses ReasoningText without cycling guessed actions; a server-authored
 * current action uses the quieter ThinkingShimmer. A wall-clock timer appears
 * only when the wait is long enough to benefit from it.
 *
 * There are no separate pulsing dots — the text IS the indicator. Reasoning
 * tokens (when the model emits them) expand below via a small chevron.
 *
 * Parent contract: render this only while `currentAction || streamingReasoning`.
 * If reasoning arrives before a status receipt, the one safe fallback is the
 * static "Thinking…" label; it never rotates through inferred work.
 */
export function isPreGroundedReasoningLabel(label: string | null): boolean {
  if (!label) return true;
  return /^thinking(?:…|\.{3})?$/i.test(label.trim());
}

export function ThinkingIndicator({
  currentAction,
  streamingReasoning,
  elapsedMs,
  className,
}: {
  currentAction?: string | null;
  streamingReasoning?: string;
  /**
   * Optional controlled elapsed time. When omitted, the indicator measures
   * its own mounted wall-clock duration. Once it crosses ~2.5s a quiet timer
   * appears without becoming a second live region.
   */
  elapsedMs?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const action = currentAction?.trim() || null;
  const hasReasoning = Boolean(streamingReasoning?.trim());
  const visibleLabel = action ?? (hasReasoning ? 'Thinking…' : null);

  // If there's literally nothing to say, render nothing — let the avatar
  // sit alone rather than show a hollow indicator.
  if (!action && !hasReasoning) return null;

  return (
    <div className={cn('flex flex-col gap-1.5 justify-center min-h-7', className)}>
      {/* Row 1: safe status line + quiet timer + optional reasoning chevron */}
      <div className="flex items-center gap-1.5">
        <AnimatePresence mode="wait" initial={false}>
          {visibleLabel && (
            <motion.div
              key={visibleLabel}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
              className="flex min-h-7 items-center"
            >
              {isPreGroundedReasoningLabel(action) ? (
                <ReasoningText
                  phrases={[visibleLabel]}
                  cycle={false}
                  className="text-[13px] font-medium leading-relaxed"
                />
              ) : (
                <ThinkingShimmer className="text-[13px] font-medium leading-relaxed">
                  {visibleLabel}
                </ThinkingShimmer>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AgentProgress
          elapsedSeconds={elapsedMs === undefined ? undefined : elapsedMs / 1000}
          running
          revealAfterSeconds={2.5}
        />

        {hasReasoning && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide reasoning' : 'Show reasoning'}
            className="inline-flex items-center justify-center w-4 h-4 rounded text-foreground/35 hover:text-foreground/65 transition-colors"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{
                duration: reduceMotion ? 0 : DURATION_FAST,
                ease: EASE_OUT,
              }}
              className="inline-flex"
            >
              <ChevronDown className="w-3 h-3" />
            </motion.span>
          </button>
        )}
      </div>

      {/* Row 2: collapsible reasoning stream */}
      <AnimatePresence initial={false}>
        {open && hasReasoning && (
          <motion.div
            key="reasoning"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ChainOfThought
              content={streamingReasoning ?? ''}
              streaming
              className="max-w-prose border-0 bg-transparent px-0 py-0 pl-0.5 pb-1 text-foreground/35"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
