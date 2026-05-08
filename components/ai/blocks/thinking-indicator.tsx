'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Thinking indicator shown while Chippi is mid-turn.
 *
 * Three levels of signal:
 * 1. Animated dots — always present while streaming, indicating activity.
 * 2. "Thinking" toggle — when the model emits reasoning tokens, a label
 *    with a chevron appears next to the dots. Clicking it expands the raw
 *    reasoning stream so the realtor can see what the model is deliberating.
 * 3. Current-action line — plain text (no card) surfacing the active tool
 *    call in real English ("Searching your contacts…").
 *
 * No border. No background. No card. Just text and motion.
 */
export function ThinkingIndicator({
  currentAction,
  streamingReasoning,
  className,
}: {
  currentAction?: string | null;
  streamingReasoning?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const action = currentAction?.trim() ?? null;
  const hasReasoning = Boolean(streamingReasoning?.trim());

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Row 1: dots + optional "Thinking ▾" toggle */}
      <div className="flex items-center gap-2">
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

        {hasReasoning && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-0.5 text-[11px] text-foreground/35 hover:text-foreground/55 transition-colors leading-none"
            aria-expanded={open}
          >
            <motion.span
              animate={{ opacity: [0.5, 0.9, 0.5] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
            >
              Thinking
            </motion.span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="text-[12px] text-foreground/30 leading-relaxed max-w-prose whitespace-pre-wrap pl-0.5 pb-1">
              {streamingReasoning}
              <span className="chippi-cursor" aria-hidden="true" />
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row 3: current tool action — plain text, no card */}
      <AnimatePresence mode="wait" initial={false}>
        {action && (
          <motion.p
            key={action}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-[13px] text-foreground/50 leading-relaxed"
          >
            {action}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
