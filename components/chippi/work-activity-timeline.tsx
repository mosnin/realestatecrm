'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AgentActivityDisclosure,
  AgentProgress,
  ThinkingShimmer,
  type AgentActivityDisclosureStatus,
} from '@/components/ai/agent-status';
import type {
  WorkActivityEvent,
  WorkActivityPhase,
  WorkActivityStatus,
} from '@/lib/ai-tools/events';
import { DURATION_DROP, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';

/** Keep the live receipt readable even during tool-heavy turns. */
export const MAX_VISIBLE_WORK_ACTIVITIES = 8;

const PHASE_LABEL: Record<WorkActivityPhase, string> = {
  request: 'Request',
  context: 'Workspace',
  provider: 'Model',
  plan: 'Plan',
  tool: 'Action',
  specialist: 'Specialists',
  terminal: 'Outcome',
};

const STATUS_LABEL: Record<Exclude<WorkActivityStatus, 'active'>, string> = {
  completed: 'Done',
  failed: 'Failed',
  paused: 'Paused',
  cancelled: 'Stopped',
};

function activityKey(event: WorkActivityEvent): string {
  // A call id is the strongest lifecycle correlation: its active receipt is
  // replaced by the actual result. Phase-only runtime boundaries (request,
  // context, provider, terminal) collapse to their most recent receipt.
  return event.toolCallId ?? event.subagentRunId ?? event.phase;
}

/**
 * Select the bounded, current-turn receipt shown by the timeline.
 *
 * The hook normally performs this normalization before render. Repeating the
 * boundary here keeps the component safe when fed replayed SSE frames or a
 * mixed reconnect buffer: stale work ids and superseded lifecycle states
 * never leak into the visible surface.
 */
export function selectVisibleWorkActivities(
  events: WorkActivityEvent[],
  limit = MAX_VISIBLE_WORK_ACTIVITIES,
): WorkActivityEvent[] {
  if (events.length === 0 || limit <= 0) return [];

  const currentWorkId = events.at(-1)?.workId;
  if (!currentWorkId) return [];

  const current = events.filter((event) => event.workId === currentWorkId);
  const latestByKey = new Map<string, { event: WorkActivityEvent; index: number }>();

  current.forEach((event, index) => {
    latestByKey.set(activityKey(event), { event, index });
  });

  return [...latestByKey.values()]
    .sort((left, right) => left.index - right.index)
    .slice(-Math.min(limit, MAX_VISIBLE_WORK_ACTIVITIES))
    .map(({ event }) => event);
}

export function workActivityStatusLabel(
  status: WorkActivityStatus,
  isLatest: boolean,
): string {
  if (status === 'active') return isLatest ? 'Working' : 'Started';
  return STATUS_LABEL[status];
}

/** A Work turn remains active until its grounded terminal receipt arrives. */
export function workActivityDisclosureStatus(
  events: WorkActivityEvent[],
): AgentActivityDisclosureStatus {
  const terminal = [...events]
    .reverse()
    .find((event) => event.phase === 'terminal');
  return terminal && terminal.status !== 'active' ? 'complete' : 'working';
}

function statusTone(status: WorkActivityStatus): string {
  if (status === 'failed') {
    return 'text-rose-700 dark:text-rose-300';
  }
  if (status === 'active') {
    return 'text-foreground/75';
  }
  return 'text-muted-foreground';
}

export function WorkActivityTimeline({
  events,
  className,
}: {
  events: WorkActivityEvent[];
  className?: string;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const visible = selectVisibleWorkActivities(events);

  if (visible.length === 0) return null;

  const latest = visible.at(-1)!;
  const latestStatus = workActivityStatusLabel(latest.status, true);
  const disclosureStatus = workActivityDisclosureStatus(visible);
  const currentReceiptIsActive =
    disclosureStatus === 'working' && latest.status === 'active';

  return (
    <>
      {/* Announce only the newest grounded runtime receipt. Putting the live
          region on the visual list would re-announce every preceding row. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {latest.label}. {latestStatus}.
      </p>

      <AgentActivityDisclosure
        title={<span className={SECTION_LABEL}>Work activity</span>}
        status={disclosureStatus}
        collapseOnComplete
        meta={`${visible.length} ${visible.length === 1 ? 'step' : 'steps'}`}
        summary={
          <>
            <span className="min-w-0 flex-1 truncate">
              {currentReceiptIsActive ? (
                <ThinkingShimmer>{latest.label}</ThinkingShimmer>
              ) : (
                latest.label
              )}
            </span>
            {disclosureStatus === 'working' ? (
              <AgentProgress running revealAfterSeconds={2.5} />
            ) : null}
          </>
        }
        className={className}
      >

        <ol aria-label="Grounded work progress" className="divide-y divide-border/40 px-0">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((event, index) => {
              const isLatest = index === visible.length - 1;
              const statusLabel = workActivityStatusLabel(event.status, isLatest);
              const activeNow = event.status === 'active' && isLatest;

              return (
                <motion.li
                  layout={!reduceMotion}
                  key={`${event.workId}:${activityKey(event)}`}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: DURATION_DROP, ease: EASE_OUT }}
                  className="flex min-w-0 items-start gap-3 py-3"
                >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/35',
                    event.status === 'failed' && 'bg-rose-500',
                    activeNow && 'bg-foreground',
                    activeNow && !reduceMotion && 'animate-pulse',
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
                      {PHASE_LABEL[event.phase]}
                    </span>
                    <span className="truncate text-[12.5px] leading-5 text-foreground/85">
                      {event.label}
                    </span>
                  </span>
                  {(event.planStepCount !== undefined || event.subagentRunId) && (
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground">
                      {event.planStepCount !== undefined
                        ? `${event.planStepCount} plan ${event.planStepCount === 1 ? 'step' : 'steps'}`
                        : 'Live specialist run attached below'}
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    'mt-0.5 shrink-0 py-0.5',
                    'text-[9.5px] font-semibold uppercase tracking-[0.08em]',
                    statusTone(event.status),
                  )}
                >
                  {statusLabel}
                </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </AgentActivityDisclosure>
    </>
  );
}
