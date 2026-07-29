'use client';

/**
 * Durable inline specialist tree for work started with `delegate_task`.
 *
 * The persisted chat block owns the run id. On every mount we hydrate the
 * current run + members from the tenant-authenticated GET route, then attach
 * the existing SSE stream for live deltas. Final results therefore survive a
 * conversation switch or reload without relying on historical event replay.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  OctagonX,
  Square,
  XCircle,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CAPTION, BODY, BODY_MUTED } from '@/lib/typography';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';
import type { SubagentTaskBlock } from '@/lib/ai-tools/blocks';
import type {
  MemberStatus,
  SwarmEventType,
  SwarmMember,
  SwarmRun,
  SwarmStatus,
} from '@/lib/swarm-types';

interface CardState {
  status: SwarmStatus;
  members: Record<string, SwarmMember>;
  thinking: Record<string, string>;
  result: string | null;
  error: string | null;
  connected: boolean;
  hydrated: boolean;
}

type Action =
  | { type: 'hydrate'; run: SwarmRun; members: SwarmMember[] }
  | { type: 'disconnect' }
  | { type: SwarmEventType; data: Record<string, unknown> };

const TERMINAL = new Set<SwarmStatus>(['completed', 'failed', 'cancelled']);
const SSE_TYPES: SwarmEventType[] = [
  'connected',
  'swarm_planning',
  'plan_created',
  'agent_started',
  'agent_thinking',
  'agent_completed',
  'agent_failed',
  'wave_2_starting',
  'audit_started',
  'swarm_completed',
  'swarm_failed',
  'swarm_cancelled',
  'stream_end',
];

function memberId(data: Record<string, unknown>): string | null {
  return typeof data.memberId === 'string' ? data.memberId : null;
}

function updateMember(
  state: CardState,
  data: Record<string, unknown>,
  patch: Partial<SwarmMember>,
): CardState {
  const id = memberId(data);
  if (!id) return state;
  const existing = state.members[id];
  const member: SwarmMember = {
    id,
    swarmRunId: existing?.swarmRunId ?? '',
    customAgentId: existing?.customAgentId ?? null,
    name: existing?.name ?? (typeof data.name === 'string' ? data.name : 'Specialist'),
    role: existing?.role ?? (typeof data.role === 'string' ? data.role : null),
    systemPrompt: '',
    task: existing?.task ?? (typeof data.task === 'string' ? data.task : ''),
    status: existing?.status ?? 'queued',
    output: existing?.output ?? null,
    wave: existing?.wave ?? 1,
    costCents: existing?.costCents ?? 0,
    startedAt: existing?.startedAt ?? null,
    completedAt: existing?.completedAt ?? null,
    createdAt: existing?.createdAt ?? '',
    ...patch,
  };
  return { ...state, members: { ...state.members, [id]: member } };
}

export function subagentTaskReducer(state: CardState, action: Action): CardState {
  if (action.type === 'hydrate') {
    const currentTerminal = TERMINAL.has(state.status);
    const sameTerminalSnapshot = currentTerminal && action.run.status === state.status;
    if (currentTerminal && !sameTerminalSnapshot) {
      return { ...state, connected: false, hydrated: true };
    }

    const members = { ...state.members };
    for (const item of action.members) {
      const liveMember = state.members[item.id];
      // A delayed hydration request (used just after planning) must not
      // downgrade a terminal SSE update that arrived while GET was in flight.
      members[item.id] =
        liveMember &&
        (liveMember.status === 'completed' || liveMember.status === 'failed') &&
        item.status !== 'completed' &&
        item.status !== 'failed'
          ? liveMember
          : item;
    }
    return {
      ...state,
      status: action.run.status,
      members,
      result: sameTerminalSnapshot
        ? (action.run.result ?? state.result)
        : action.run.result,
      error: sameTerminalSnapshot
        ? (action.run.errorMessage ?? state.error)
        : action.run.errorMessage,
      connected: TERMINAL.has(action.run.status) ? false : state.connected,
      hydrated: true,
    };
  }
  if (action.type === 'disconnect') return { ...state, connected: false };

  const { type, data } = action;
  const terminal = TERMINAL.has(state.status);
  switch (type) {
    case 'connected': {
      if (terminal) return state;
      const connectedStatus =
        typeof data.status === 'string' ? (data.status as SwarmStatus) : state.status;
      return {
        ...state,
        connected: !TERMINAL.has(connectedStatus),
        status: connectedStatus,
      };
    }
    case 'swarm_planning':
      return terminal ? state : { ...state, status: 'planning' };
    case 'plan_created':
    case 'agent_started':
      return updateMember(
        terminal ? state : { ...state, status: 'running' },
        data,
        { status: type === 'agent_started' ? 'running' : 'queued' },
      );
    case 'agent_thinking': {
      const id = memberId(data);
      if (!id || typeof data.message !== 'string') return state;
      return { ...state, thinking: { ...state.thinking, [id]: data.message } };
    }
    case 'agent_completed':
      return updateMember(state, data, {
        status: 'completed',
        output: typeof data.output === 'string' ? data.output : null,
      });
    case 'agent_failed':
      return updateMember(state, data, {
        status: 'failed',
        output:
          typeof data.error === 'string' ? data.error : 'This specialist could not finish.',
      });
    case 'audit_started':
      return terminal ? state : { ...state, status: 'auditing' };
    case 'swarm_completed':
      if (terminal) return state;
      return {
        ...state,
        status: 'completed',
        result: typeof data.result === 'string' ? data.result : state.result,
        connected: false,
      };
    case 'swarm_failed':
      if (terminal) return state;
      return {
        ...state,
        status: 'failed',
        error:
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : 'The delegated task ran into a problem.',
        connected: false,
      };
    case 'swarm_cancelled':
      return terminal ? state : { ...state, status: 'cancelled', connected: false };
    case 'stream_end':
      return { ...state, connected: false };
    default:
      return state;
  }
}

export function shouldHydrateAfterStreamEvent(
  type: SwarmEventType,
  data: Record<string, unknown>,
): boolean {
  return (
    type === 'connected' &&
    typeof data.status === 'string' &&
    TERMINAL.has(data.status as SwarmStatus)
  );
}

function parentStatus(status: SwarmStatus): string {
  switch (status) {
    case 'queued':
      return 'Choosing specialists…';
    case 'planning':
      return 'Planning specialist tasks…';
    case 'running':
      return 'Specialists are working';
    case 'auditing':
      return 'Combining specialist results…';
    case 'completed':
      return 'Combined answer ready';
    case 'failed':
      return 'Task could not finish';
    case 'cancelled':
      return 'Stopped';
  }
}

type DisplayMemberStatus = MemberStatus | 'cancelled';

export function displayedMemberStatus(
  member: SwarmMember,
  parent: SwarmStatus,
): DisplayMemberStatus {
  if (parent === 'cancelled' && member.status !== 'completed' && member.status !== 'failed') {
    return 'cancelled';
  }
  return member.status;
}

function MemberIcon({ status }: { status: DisplayMemberStatus }) {
  switch (status) {
    case 'queued':
      return <Circle className="size-3.5 text-muted-foreground" />;
    case 'running':
      return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
    case 'completed':
      return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case 'failed':
      return <XCircle className="size-3.5 text-destructive" />;
    case 'cancelled':
      return <OctagonX className="size-3.5 text-muted-foreground" />;
  }
}

function MemberRow({
  member,
  parentStatusValue,
  thinking,
}: {
  member: SwarmMember;
  parentStatusValue: SwarmStatus;
  thinking: string | null;
}) {
  const status = displayedMemberStatus(member, parentStatusValue);
  const label = status === 'cancelled' ? 'stopped' : status;
  return (
    <li className="border-t border-border/50 first:border-t-0">
      <details className="group py-2.5">
        <summary className="flex cursor-pointer list-none items-start gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <span className="mt-0.5">
            <MemberIcon status={status} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-foreground">{member.name}</span>
              <span className={cn(CAPTION, 'capitalize')}>{label}</span>
            </span>
            {member.role ? <span className={CAPTION}>{member.role}</span> : null}
            <span className={cn(BODY_MUTED, 'mt-1 block leading-snug')}>{member.task}</span>
            {status === 'running' && thinking ? (
              <span className={cn(CAPTION, 'mt-1 block italic')}>{thinking}</span>
            ) : null}
          </span>
          {member.output ? (
            <ChevronDown className="mt-0.5 size-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
          ) : null}
        </summary>
        {member.output ? (
          <p className={cn(BODY_MUTED, 'ml-6 mt-2 whitespace-pre-wrap border-l pl-3')}>
            {member.output}
          </p>
        ) : null}
      </details>
    </li>
  );
}

export interface SubagentTaskBlockViewProps {
  block: SubagentTaskBlock;
}

export async function cancelSpecialistTask(
  runId: string,
  hydrate: () => Promise<SwarmStatus>,
  fetcher: typeof fetch = fetch,
): Promise<SwarmStatus> {
  const response = await fetcher(`/api/swarm/${runId}/cancel`, { method: 'POST' });
  const body = (await response.json().catch(() => ({}))) as { error?: string };

  // A 409 means the worker's terminal transition won the status-conditional
  // race. That is not a stuck cancel: reload the authoritative result so the
  // same chat card becomes completed/failed with its durable outputs.
  if (response.ok || response.status === 409) {
    return hydrate();
  }
  throw new Error(body.error ?? 'Unable to stop this task.');
}

export function SubagentTaskBlockView({ block }: SubagentTaskBlockViewProps) {
  const [state, dispatch] = useReducer(subagentTaskReducer, {
    status: 'queued',
    members: {},
    thinking: {},
    result: null,
    error: null,
    connected: false,
    hydrated: false,
  });
  const [cancelPending, setCancelPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/swarm/${block.runId}`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) throw new Error('Unable to load specialist progress.');
    const payload = (await response.json()) as { run: SwarmRun; members: SwarmMember[] };
    dispatch({ type: 'hydrate', run: payload.run, members: payload.members });
    return payload.run.status;
  }, [block.runId]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    void hydrate(controller.signal)
      .then((status) => {
        if (disposed || TERMINAL.has(status)) return;
        const es = new EventSource(`/api/swarm/${block.runId}/stream`);
        esRef.current = es;
        SSE_TYPES.forEach((evType) => {
          es.addEventListener(evType, (event: MessageEvent) => {
            let data: Record<string, unknown> = {};
            try {
              data = JSON.parse(event.data);
            } catch {
              // Ignore a malformed progress payload; hydration remains usable.
            }
            dispatch({ type: evType, data });
            if (shouldHydrateAfterStreamEvent(evType, data)) {
              // The stream can connect after the run has already finished.
              // Re-read the authoritative run so the terminal result and full
              // member snapshot are not lost between the initial GET and SSE.
              void hydrate().catch(() => {});
            } else if (evType === 'plan_created') {
              // The plan event is emitted after all members are durable. A
              // short refresh brings queued later-wave specialists into view.
              refreshTimerRef.current = setTimeout(() => {
                void hydrate().catch(() => {});
              }, 250);
            }
          });
        });
        es.onerror = () => dispatch({ type: 'disconnect' });
      })
      .catch((error: unknown) => {
        if (!disposed && (error as { name?: string })?.name !== 'AbortError') {
          setActionError(error instanceof Error ? error.message : 'Unable to load specialist progress.');
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      esRef.current?.close();
      esRef.current = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [block.runId, hydrate]);

  useEffect(() => {
    if (TERMINAL.has(state.status)) {
      esRef.current?.close();
      esRef.current = null;
    }
  }, [state.status]);

  async function cancelRun() {
    setCancelPending(true);
    setActionError(null);
    try {
      await cancelSpecialistTask(block.runId, () => hydrate());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to stop this task.');
    } finally {
      setCancelPending(false);
    }
  }

  const members = Object.values(state.members);
  const terminal = TERMINAL.has(state.status);
  const failed = state.status === 'failed';
  const cancelled = state.status === 'cancelled';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
      className={cn(
        'rounded-xl border bg-muted/20 px-4 py-3',
        failed ? 'border-destructive/30' : 'border-border/70',
      )}
      aria-label={`Specialist task: ${block.goal}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'size-1.5 flex-shrink-0 rounded-full',
                failed
                  ? 'bg-destructive'
                  : state.status === 'completed'
                    ? 'bg-emerald-500'
                    : cancelled
                      ? 'bg-muted-foreground'
                      : 'bg-blue-500',
                !terminal && 'animate-pulse',
              )}
              aria-hidden
            />
            <p className={cn(CAPTION, 'uppercase tracking-wide')}>Specialist task</p>
          </div>
          <p className={cn(BODY, 'mt-1.5 leading-snug')}>{block.goal}</p>
          <p className={cn(CAPTION, 'mt-1')}>{parentStatus(state.status)}</p>
        </div>

        {!terminal && state.hydrated ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={cancelPending}
            onClick={cancelRun}
            aria-label="Stop all specialists"
          >
            <Square className="size-3 fill-current" />
            {cancelPending ? 'Stopping…' : 'Stop'}
          </Button>
        ) : null}
      </div>

      {members.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-3">
          <p className={cn(CAPTION, 'pt-2 uppercase tracking-wide')}>Specialists</p>
          <ol>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                parentStatusValue={state.status}
                thinking={state.thinking[member.id] ?? null}
              />
            ))}
          </ol>
        </div>
      ) : !terminal ? (
        <p className={cn(BODY_MUTED, 'mt-3')}>The specialist plan will appear here.</p>
      ) : null}

      {state.result ? (
        <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
          <p className={cn(CAPTION, 'uppercase tracking-wide text-foreground')}>
            Combined outcome
          </p>
          <p className={cn(BODY, 'mt-1.5 whitespace-pre-wrap text-foreground/90')}>
            {state.result}
          </p>
        </div>
      ) : null}

      {cancelled ? (
        <p className={cn(CAPTION, 'mt-2')}>
          Stopped. A specialist already inside a model call may finish that call, but Chippi will
          not publish it over this cancelled task.
        </p>
      ) : null}

      {failed ? (
        <p className={cn(CAPTION, 'mt-2 text-destructive')}>
          {state.error ?? 'The specialist task did not finish.'}
        </p>
      ) : null}

      {actionError ? (
        <p className={cn(CAPTION, 'mt-2 text-destructive')} role="alert">
          {actionError}
        </p>
      ) : null}

      {!terminal && state.hydrated && !state.connected ? (
        <p className={cn(CAPTION, 'mt-2')}>Reconnecting live progress…</p>
      ) : null}
    </motion.section>
  );
}
