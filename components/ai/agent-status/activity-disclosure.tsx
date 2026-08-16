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
  /**
   * When true (default), a live turn cannot be collapsed. Work chat passes
   * false so the activity log starts as one summary line instead of a
   * full-height receipt.
   */
  keepOpenWhileWorking?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * A single activity disclosure. Live work stays expandable; the Work
 * surface opts out of forcing it open so the chat stays readable.
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
  keepOpenWhileWorking = true,
  className,
  contentClassName,
}: AgentActivityDisclosureProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const contentId = useId();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(
    (keepOpenWhileWorking && status === 'working') || defaultOpen,
  );
  const previousStatus = useRef(status);

  useEffect(() => {
    if (status === 'working') {
      if (keepOpenWhileWorking && !controlled) setInternalOpen(true);
    } else if (
      previousStatus.current === 'working' &&
      collapseOnComplete
    ) {
      if (!controlled) setInternalOpen(false);
      onOpenChange?.(false);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, controlled, keepOpenWhileWorking, onOpenChange, status]);

  const forceOpen = keepOpenWhileWorking && status === 'working';
  const expanded = forceOpen || (controlled ? open : internalOpen);
  const setExpanded = (next: boolean) => {
    if (forceOpen) return;
    if (!controlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      data-agent-activity-status={status}
      data-agent-surface-style="inline"
      className={cn(
        'overflow-hidden border-y border-border/45 bg-transparent',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-disabled={forceOpen || undefined}
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-start justify-between gap-3 px-0 py-3.5 text-left',
          'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45',
          status === 'complete' && 'hover:text-foreground',
          expanded && 'border-b border-border/45',
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
            forceOpen && 'opacity-35',
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
