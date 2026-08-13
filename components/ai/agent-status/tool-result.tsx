'use client';

import {
  Ban,
  Braces,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  Copy,
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
  copyText?: string;
  onCopy?: () => void | Promise<void>;
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
  copyText,
  onCopy,
  className,
  contentClassName,
}: AgentToolResultProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const contentId = useId();
  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const previousStatus = useRef(status);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
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

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
  }, []);

  const copy = async () => {
    try {
      if (onCopy) await onCopy();
      else if (copyText && navigator.clipboard) await navigator.clipboard.writeText(copyText);
      else return;
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

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
      data-state={status}
      aria-busy={running}
      className={cn('w-full text-sm', className)}
    >
      <button
        type="button"
        aria-expanded={hasDetails ? expanded : undefined}
        aria-controls={hasDetails ? contentId : undefined}
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={cn(
          'group flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
          'focus-visible:ring-2 focus-visible:ring-ring',
          hasDetails ? 'transition-colors hover:bg-muted/25' : 'cursor-default',
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
            <div className="ml-6 mt-1.5 overflow-hidden rounded-xl border border-border/55 bg-muted/35">
              <div
                role={running ? 'log' : 'region'}
                aria-live={running ? 'polite' : undefined}
                className={cn('overflow-y-auto p-3', contentClassName)}
                style={{ maxHeight }}
              >
                {children}
              </div>
              {copyText || onCopy ? (
                <div className="flex items-center border-t border-border/50 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => void copy()}
                    aria-label={copied ? 'Result copied' : 'Copy result'}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
