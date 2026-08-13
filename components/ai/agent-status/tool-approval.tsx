'use client';

import {
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import React from 'react';
import { DURATION_BASE, DURATION_FAST, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type ToolApprovalStatus =
  | 'pending'
  | 'approving'
  | 'approved'
  | 'denied'
  | 'running'
  | 'complete'
  | 'error';

export interface ToolApprovalProps {
  tool: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  status?: ToolApprovalStatus;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

function statusCopy(status: ToolApprovalStatus): string {
  if (status === 'approving') return 'Approving';
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Denied';
  if (status === 'running') return 'Running';
  if (status === 'complete') return 'Completed';
  if (status === 'error') return 'Failed';
  return 'Approval required';
}

function statusTone(status: ToolApprovalStatus): string {
  if (status === 'pending') {
    return 'text-amber-700 dark:text-amber-300';
  }
  if (status === 'approving' || status === 'running') {
    return 'text-foreground/70';
  }
  if (status === 'approved' || status === 'complete') {
    return 'text-emerald-700 dark:text-emerald-300';
  }
  return 'text-rose-700 dark:text-rose-300';
}

/**
 * Chippi adaptation of BEUI Tool Approval. It owns disclosure and status
 * semantics; callers retain their domain-specific editors and callbacks.
 */
export function ToolApproval({
  tool,
  title = 'Allow this tool to run?',
  description,
  status = 'pending',
  open,
  defaultOpen = true,
  onOpenChange,
  children,
  actions,
  className,
}: ToolApprovalProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const detailsId = useId();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const previousStatus = useRef(status);
  const expanded = open ?? internalOpen;
  const busy = status === 'approving' || status === 'running';

  const setExpanded = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  useEffect(() => {
    if (previousStatus.current === 'pending' && status !== 'pending') {
      setExpanded(false);
    }
    previousStatus.current = status;
  }, [setExpanded, status]);

  const StatusIcon = busy
    ? LoaderCircle
    : status === 'error'
      ? CircleAlert
      : status === 'denied'
        ? X
        : status === 'approved' || status === 'complete'
          ? Check
          : ShieldCheck;

  return (
    <section
      data-beui-surface="tool-approval"
      data-agent-surface-style="inline"
      data-state={status}
      aria-busy={busy}
      className={cn(
        'w-full overflow-hidden border-y border-border/45 bg-transparent',
        className,
      )}
    >
      <div className="flex items-start gap-3 px-0 py-3.5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid size-6 shrink-0 place-items-center text-muted-foreground"
        >
          <StatusIcon className={cn('size-4', busy && !reduceMotion && 'animate-spin')} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-5 text-foreground">{title}</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {tool}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em]',
                statusTone(status),
              )}
            >
              {statusCopy(status)}
            </span>
          </div>

          {description ? (
            <p className="mt-2 text-[12.5px] leading-5 text-muted-foreground">{description}</p>
          ) : null}

          {children ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={() => setExpanded(!expanded)}
              className="mt-2 inline-flex items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {expanded ? 'Hide details' : 'View details'}
              <motion.span
                aria-hidden="true"
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: reduceMotion ? 0 : DURATION_FAST, ease: EASE_OUT }}
              >
                <ChevronDown className="size-3.5" />
              </motion.span>
            </button>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {children && expanded ? (
          <motion.div
            id={detailsId}
            key="details"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="ml-9 mb-3 border-l border-border/45 py-1 pl-3">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/45 px-0 py-3">
          {actions}
        </div>
      ) : null}
    </section>
  );
}
