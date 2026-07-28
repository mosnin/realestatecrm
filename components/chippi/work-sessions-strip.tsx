'use client';

/**
 * WorkSessionsStrip — live cards for Chippi's background work sessions,
 * rendered above the composer (hero and docked footer alike).
 *
 * The WorkSession row IS the progress feed: initial load over REST, then
 * Supabase Realtime postgres_changes keeps every card current — plan steps
 * tick from pending → running → done while the realtor does something else,
 * approval and check-in questions appear inline, and a finished session
 * offers its deliverable. Finished cards are dismissable (local hide);
 * active ones are not — work in flight should stay visible.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Check, X, Circle, CircleDashed, FileText, Sparkles, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/hooks/use-realtime';
import type { PlanStep, WorkSessionRow } from '@/lib/work-sessions/types';

const ACTIVE = new Set(['planning', 'awaiting_approval', 'awaiting_input', 'running']);

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning…',
  awaiting_approval: 'Plan ready — waiting on you',
  awaiting_input: 'Has a question for you',
  running: 'Working…',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function WorkSessionsStrip({
  slug,
  spaceId,
  hiddenSessionIds,
}: {
  slug: string;
  spaceId: string;
  /** Sessions already rendered inline in the open conversation. */
  hiddenSessionIds?: ReadonlySet<string>;
}) {
  const [sessions, setSessions] = useState<WorkSessionRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-sessions?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: WorkSessionRow[] };
      setSessions(json.sessions);
    } catch {
      /* strip is decoration over the chat — never crash it */
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live overlay — any change to this space's sessions lands here.
  useRealtime<Record<string, unknown>>({
    table: 'WorkSession',
    event: '*',
    filter: `spaceId=eq.${spaceId}`,
    onEvent: (payload) => {
      const row = (payload.new ?? payload.old) as unknown as WorkSessionRow | null;
      if (!row?.id) return;
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== row.id);
        return payload.eventType === 'DELETE' ? rest : [row, ...rest];
      });
    },
  });

  const visible = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)),
    );
    // Every active session + the most recent finished one (until dismissed).
    const eligible = sorted.filter((s) => !hiddenSessionIds?.has(s.id));
    const active = eligible.filter((s) => ACTIVE.has(s.status));
    const finished = eligible.find((s) => !ACTIVE.has(s.status) && !dismissed.has(s.id));
    return finished ? [...active, finished] : active;
  }, [sessions, dismissed, hiddenSessionIds]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-2 space-y-2">
      {visible.map((s) => (
        <WorkSessionCard
          key={s.id}
          session={s}
          slug={slug}
          onDismiss={
            ACTIVE.has(s.status) ? undefined : () => setDismissed((d) => new Set(d).add(s.id))
          }
        />
      ))}
    </div>
  );
}

function StepIcon({ status }: { status: PlanStep['status'] }) {
  if (status === 'done') return <Check size={12} className="text-foreground" strokeWidth={2.5} />;
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-foreground" />;
  if (status === 'skipped') return <X size={12} className="text-muted-foreground/60" />;
  return <Circle size={8} className="mt-0.5 text-muted-foreground/40" />;
}

export function WorkSessionCard({
  session, slug, onDismiss,
}: {
  session: WorkSessionRow;
  slug: string;
  onDismiss?: () => void;
}) {
  const [expanded, setExpanded] = useState(ACTIVE.has(session.status));
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(action: 'approve' | 'cancel' | 'answer') {
    setBusy(true);
    try {
      await fetch(`/api/work-sessions/${session.id}?slug=${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'answer' ? { action, answer } : { action }),
      });
      // Realtime delivers the new state; nothing else to do.
    } finally {
      setBusy(false);
    }
  }

  const isActive = ACTIVE.has(session.status);
  const doneCount = session.plan.filter((p) => p.status === 'done').length;

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm">
      {/* Header row — always visible, one glance = state. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5"
        aria-expanded={expanded}
      >
        {isActive && session.status !== 'awaiting_approval' && session.status !== 'awaiting_input' ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-foreground" />
        ) : session.status === 'completed' ? (
          <Sparkles size={14} className="shrink-0 text-foreground" />
        ) : (
          <CircleDashed size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {session.goal}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {STATUS_LABEL[session.status] ?? session.status}
          {session.status === 'running' && session.plan.length > 0 && (
            <span className="tabular-nums"> · {doneCount}/{session.plan.length}</span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="mt-2.5 space-y-2.5 border-t border-border/60 pt-2.5">
          {/* Plan steps, ticking live. */}
          {session.plan.length > 0 && (
            <ul className="space-y-1">
              {session.plan.map((step) => (
                <li key={step.id} className="flex items-center gap-2 text-[12px]">
                  <span className="flex w-4 justify-center">{<StepIcon status={step.status} />}</span>
                  <span
                    className={cn(
                      step.status === 'done' ? 'text-muted-foreground' : 'text-foreground',
                      step.status === 'skipped' && 'text-muted-foreground/60 line-through',
                    )}
                  >
                    {step.title}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Approval gate. */}
          {session.status === 'awaiting_approval' && (
            <div className="flex items-center gap-2">
              <Button size="xs" onClick={() => void act('approve')} disabled={busy}>
                Approve plan
              </Button>
              <Button size="xs" variant="ghost" onClick={() => void act('cancel')} disabled={busy}>
                Cancel
              </Button>
            </div>
          )}

          {/* Check-in question. */}
          {session.status === 'awaiting_input' && session.question && (
            <div className="space-y-1.5">
              <p className="text-[12px] text-foreground">{session.question}</p>
              <div className="flex gap-1.5">
                <Input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && answer.trim() && void act('answer')}
                  placeholder="Your answer…"
                  className="h-8 text-[12px]"
                />
                <Button size="xs" onClick={() => void act('answer')} disabled={busy || !answer.trim()}>
                  Send
                </Button>
              </div>
            </div>
          )}

          {/* Finished: summary + deliverable. */}
          {session.status === 'completed' && (
            <div className="space-y-1.5">
              {session.summary && <p className="text-[12px] text-muted-foreground">{session.summary}</p>}
              {session.artifactFileId && (
                <a
                  href={`/api/work-sessions/${session.id}/artifact?slug=${encodeURIComponent(slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
                >
                  <FileText size={12} />
                  {session.artifactName ?? 'Open the report'}
                </a>
              )}
            </div>
          )}
          {session.status === 'failed' && session.error && (
            <p className="text-[12px] text-destructive">{session.error}</p>
          )}

          {/* Card controls. */}
          <div className="flex justify-end gap-2">
            {isActive && session.status !== 'awaiting_approval' && (
              <Button size="xs" variant="ghost" onClick={() => void act('cancel')} disabled={busy}>
                Cancel session
              </Button>
            )}
            {onDismiss && (
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
