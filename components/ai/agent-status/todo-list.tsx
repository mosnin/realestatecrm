'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Minus, X } from 'lucide-react';
import React from 'react';
import type { ReactNode } from 'react';
import { AgentActivityDisclosure } from './activity-disclosure';
import { DURATION_DROP, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';

export type AgentTodoStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentTodoItem {
  id: string;
  title: ReactNode;
  status: AgentTodoStatus;
  /** Optional grounded detail such as a runtime-reported percentage. */
  detail?: ReactNode;
  /** Rendered only when the caller has an actual 0-100 progress value. */
  progress?: number;
}

export interface AgentTodoListProps {
  items: AgentTodoItem[];
  title?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  className?: string;
}

export function agentTodoListStatus(
  items: AgentTodoItem[],
): 'working' | 'complete' {
  return items.some(
    (item) => item.status === 'pending' || item.status === 'in-progress',
  )
    ? 'working'
    : 'complete';
}

export function boundedTodoProgress(progress: number | undefined): number | null {
  if (progress === undefined || !Number.isFinite(progress)) return null;
  return Math.min(100, Math.max(0, progress));
}

function TodoStatusMark({ status }: { status: AgentTodoStatus }) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={status}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
        transition={{ duration: DURATION_DROP, ease: EASE_OUT }}
        className={cn(
          'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
          status === 'pending' && 'border-border/80 text-muted-foreground/40',
          status === 'in-progress' && 'border-foreground/25 text-foreground/65',
          status === 'completed' && 'border-foreground/15 bg-foreground text-background',
          status === 'failed' && 'border-rose-500/35 text-rose-600 dark:text-rose-300',
          status === 'cancelled' && 'border-border text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {status === 'completed' ? (
          <Check className="size-2.5" strokeWidth={2.2} />
        ) : status === 'failed' ? (
          <X className="size-2.5" strokeWidth={1.8} />
        ) : status === 'cancelled' ? (
          <Minus className="size-2.5" strokeWidth={1.8} />
        ) : status === 'in-progress' ? (
          <motion.span
            className="size-1 rounded-full bg-current"
            animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: EASE_OUT }}
          />
        ) : null}
      </motion.span>
    </AnimatePresence>
  );
}

/**
 * Presentation-only task plan. It accepts explicit task identities and
 * statuses; it never expands a planStepCount into guessed tasks or advances
 * steps on a timer. The active PlanCard can wire real plan/runtime data here
 * when that data contract is available.
 */
export function AgentTodoList({
  items,
  title = 'To-dos',
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  className,
}: AgentTodoListProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const status = agentTodoListStatus(items);
  const completed = items.filter((item) => item.status === 'completed').length;

  return (
    <AgentActivityDisclosure
      title={<span className={SECTION_LABEL}>{title}</span>}
      status={status}
      meta={`${completed}/${items.length}`}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      collapseOnComplete={collapseOnComplete}
      className={className}
    >
      <ol aria-label="Agent task plan" className="divide-y divide-border/50 px-4">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => {
            const progress = boundedTodoProgress(item.progress);
            return (
              <motion.li
                layout={!reduceMotion}
                key={item.id}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: DURATION_DROP, ease: EASE_OUT }}
                className="flex min-w-0 items-start gap-2.5 py-2.5"
              >
                <TodoStatusMark status={item.status} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[12.5px] leading-5 text-foreground/85',
                      item.status === 'completed' && 'text-muted-foreground line-through decoration-foreground/20',
                    )}
                  >
                    {item.title}
                  </span>
                  {item.detail ? (
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                  {progress !== null ? (
                    <span
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress)}
                      className="mt-1.5 block h-px overflow-hidden bg-border/70"
                    >
                      <motion.span
                        className="block h-full bg-foreground/55"
                        animate={{ width: `${progress}%` }}
                        transition={{
                          duration: reduceMotion ? 0 : DURATION_DROP,
                          ease: EASE_OUT,
                        }}
                      />
                    </span>
                  ) : null}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </AgentActivityDisclosure>
  );
}
