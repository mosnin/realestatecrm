'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  DURATION_BASE,
  DURATION_FAST,
  EASE_OUT,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

export type AgentActivityDisclosureStatus = 'working' | 'complete';

export interface AgentActivityDisclosureProps {
  title: ReactNode;
  children: ReactNode;
  status?: AgentActivityDisclosureStatus;
  summary?: ReactNode;
  meta?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * A single activity disclosure with an invariant that live work cannot be
 * hidden. Once the terminal receipt arrives, it becomes an ordinary
 * user-controlled disclosure and may collapse into its compact summary.
 */
export function AgentActivityDisclosure({
  title,
  children,
  status = 'working',
  summary,
  meta,
  open,
  defaultOpen = false,
  onOpenChange,
  collapseOnComplete = true,
  className,
  contentClassName,
}: AgentActivityDisclosureProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const contentId = useId();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(
    status === 'working' || defaultOpen,
  );
  const previousStatus = useRef(status);

  useEffect(() => {
    if (status === 'working') {
      if (!controlled) setInternalOpen(true);
    } else if (
      previousStatus.current === 'working' &&
      collapseOnComplete
    ) {
      if (!controlled) setInternalOpen(false);
      onOpenChange?.(false);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, controlled, onOpenChange, status]);

  const expanded = status === 'working' || (controlled ? open : internalOpen);
  const setExpanded = (next: boolean) => {
    if (status === 'working') return;
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      data-agent-activity-status={status}
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card',
        'shadow-[0_1px_2px_rgba(15,23,42,0.035)] dark:shadow-none',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-disabled={status === 'working'}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-start justify-between gap-3 px-4 py-3 text-left',
          'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          status === 'complete' && 'hover:bg-muted/25',
          expanded && 'border-b border-border/60',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1">{title}</span>
            {meta ? (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {meta}
              </span>
            ) : null}
          </span>
          {summary ? (
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </span>

        <motion.svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : DURATION_FAST,
            ease: EASE_OUT,
          }}
          className={cn(
            'mt-0.5 size-3.5 shrink-0 text-muted-foreground/55',
            status === 'working' && 'opacity-35',
          )}
          fill="none"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.25"
          />
        </motion.svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={contentId}
            key="activity-content"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion
              ? { opacity: 1 }
              : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className={cn('overflow-hidden', contentClassName)}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
