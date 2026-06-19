'use client';

/**
 * Deal progress TIMELINE + milestones — the client-facing visual answer to
 * "where are we?". Pure presentational client component (motion only); it
 * receives already-scoped, already-safe data from the server page. It never
 * fetches and never sees an internal field — the server resolved everything.
 *
 * Motion respects prefers-reduced-motion via the shared portal primitives'
 * tokens, matching the rest of the portal's calm cadence.
 */

import { motion, useReducedMotion } from 'motion/react';
import { Check, Circle, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT, CHAT_STAGGER_DELAY } from '@/lib/motion';
import type {
  ClientDealTimelineStep,
  ClientDealMilestone,
} from '@/lib/client-deals';
import { formatDealDate } from '../../portal-ui';

const SECTION_LABEL = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

/* ─── Timeline ───────────────────────────────────────────────────────────────*/

function StepNode({ state }: { state: ClientDealTimelineStep['state'] }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-500/90">
        <Check size={13} strokeWidth={2.5} />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inline-flex h-6 w-6 rounded-full bg-orange-400/30" aria-hidden />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500 ring-4 ring-orange-500/15" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center text-muted-foreground/40">
      <Circle size={11} strokeWidth={2} />
    </span>
  );
}

export function DealTimeline({ steps }: { steps: ClientDealTimelineStep[] }) {
  const reduce = useReducedMotion();
  if (steps.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className={SECTION_LABEL}>Progress</h2>
      <motion.ol
        className="relative space-y-1"
        initial="initial"
        animate="enter"
        variants={{
          initial: {},
          enter: { transition: { staggerChildren: reduce ? 0 : CHAT_STAGGER_DELAY } },
        }}
      >
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <motion.li
              key={step.id}
              className="relative flex gap-3"
              variants={{
                initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
                enter: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: DURATION_BASE, ease: EASE_OUT },
                },
              }}
            >
              {/* Connector rail between nodes. */}
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-3 top-6 h-full w-px -translate-x-1/2',
                    step.state === 'done' ? 'bg-emerald-500/40' : 'bg-border',
                  )}
                />
              )}
              <div className="relative z-10 shrink-0 pt-0.5">
                <StepNode state={step.state} />
              </div>
              <div className="min-w-0 flex-1 pb-5 pt-1">
                <p
                  className={cn(
                    'text-sm',
                    step.state === 'upcoming'
                      ? 'text-muted-foreground'
                      : 'font-medium text-foreground',
                  )}
                >
                  {step.name}
                </p>
                {step.state === 'current' && (
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-orange-600 dark:text-orange-400">
                    You are here
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </motion.ol>
    </section>
  );
}

/* ─── Milestones (from the closing checklist) ───────────────────────────────*/

export function DealMilestones({ milestones }: { milestones: ClientDealMilestone[] }) {
  const reduce = useReducedMotion();
  if (milestones.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className={SECTION_LABEL}>Key dates</h2>
      <motion.ul
        className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card"
        initial="initial"
        animate="enter"
        variants={{
          initial: {},
          enter: { transition: { staggerChildren: reduce ? 0 : CHAT_STAGGER_DELAY } },
        }}
      >
        {milestones.map((m) => {
          const due = formatDealDate(m.dueAt);
          return (
            <motion.li
              key={m.id}
              className="flex items-center gap-3 px-4 py-3.5"
              variants={{
                initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
                enter: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: DURATION_BASE, ease: EASE_OUT },
                },
              }}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  m.completed
                    ? 'bg-emerald-500 text-white dark:bg-emerald-500/90'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {m.completed ? <Check size={13} strokeWidth={2.5} /> : <CalendarDays size={12} />}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm',
                    m.completed ? 'text-muted-foreground line-through' : 'font-medium text-foreground',
                  )}
                >
                  {m.label}
                </p>
                {due && (
                  <p className="text-[11px] tabular-nums text-muted-foreground">
                    {m.completed ? 'Done' : due}
                  </p>
                )}
              </div>
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}
