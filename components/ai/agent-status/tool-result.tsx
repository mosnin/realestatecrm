'use client';

import {
  Ban,
  Braces,
  ChevronDown,
  CircleCheck,
  CircleX,
  LoaderCircle,
  SquareTerminal,
  Wrench,
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

export type AgentToolResultStatus = 'running' | 'success' | 'error' | 'cancelled';
export type AgentToolResultKind = 'terminal' | 'request' | 'custom';

export interface AgentToolResultProps {
  tool: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  status?: AgentToolResultStatus;
  kind?: AgentToolResultKind;
  meta?: ReactNode;
  icon?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  className?: string;
  contentClassName?: string;
}

function labelFor(status: AgentToolResultStatus): string {
  if (status === 'running') return 'Running';
  if (status === 'success') return 'Completed';
  if (status === 'error') return 'Failed';
  return 'Cancelled';
}

function toneFor(status: AgentToolResultStatus): string {
  if (status === 'success') return 'text-emerald-700 dark:text-emerald-300';
  if (status === 'error') return 'text-rose-700 dark:text-rose-300';
  return 'text-muted-foreground';
}

function KindIcon({ kind }: { kind: AgentToolResultKind }) {
  if (kind === 'terminal') return <SquareTerminal className="size-3.5" />;
  if (kind === 'request') return <Braces className="size-3.5" />;
  return <Wrench className="size-3.5" />;
}

/** Chippi adaptation of BEUI Tool Result for bounded, persisted output. */
export function AgentToolResult({
  tool,
  title,
  children,
  status = 'running',
  kind = 'custom',
  meta,
  icon,
  open,
  defaultOpen = status === 'running',
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 220,
  className,
  contentClassName,
}: AgentToolResultProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const contentId = useId();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const previousStatus = useRef(status);
  const expanded = open ?? internalOpen;
  const running = status === 'running';
  const hasDetails = children !== undefined && children !== null;

  const setExpanded = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  useEffect(() => {
    if (previousStatus.current !== 'running' && status === 'running') setExpanded(true);
    if (
      previousStatus.current === 'running' &&
      status !== 'running' &&
      collapseOnComplete
    ) {
      setExpanded(false);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setExpanded, status]);

  const StatusIcon = status === 'running'
    ? LoaderCircle
    : status === 'success'
      ? CircleCheck
      : status === 'error'
        ? CircleX
        : Ban;

  return (
    <section
      data-beui-surface="tool-result"
      data-agent-surface-style="inline"
      data-state={status}
      aria-busy={running}
      className={cn(
        'w-full border-y border-border/40 bg-transparent py-0.5 text-sm',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? contentId : undefined}
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          'group flex min-h-10 w-full items-center gap-2 px-0 py-2 text-left outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring/45',
          hasDetails ? 'transition-colors hover:text-foreground' : 'cursor-default',
        )}
      >
        <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center text-muted-foreground">
          {icon ?? <KindIcon kind={kind} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
          {title}
        </span>
        {meta ? <span className="shrink-0 text-[11px] text-muted-foreground/60">{meta}</span> : null}
        <span className="hidden min-w-0 truncate font-mono text-[10px] text-muted-foreground/50 sm:inline">
          {tool}
        </span>
        <span className={cn('inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold', toneFor(status))}>
          <StatusIcon className={cn('size-3', running && !reduceMotion && 'animate-spin')} />
          {labelFor(status)}
        </span>
        {hasDetails ? (
          <motion.span
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0 : DURATION_FAST, ease: EASE_OUT }}
            className="shrink-0 text-muted-foreground/50"
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {hasDetails && expanded ? (
          <motion.div
            id={contentId}
            key="content"
            initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="ml-6 mt-1.5 overflow-hidden border-l border-border/45 pl-3">
              <div
                role={running ? 'log' : 'region'}
                aria-live={running ? 'polite' : undefined}
                className={cn('overflow-y-auto py-2.5 pr-0', contentClassName)}
                style={{ maxHeight }}
              >
                {children}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
