'use client';

/**
 * WorkSessionsHistory — every background run, newest first, on
 * /chippi/sessions. The strip above the composer is the live view; this is
 * the record: read any past report, re-run a session with one tap, and
 * manage the recurring ones (a "Repeats daily" badge + Stop repeating).
 *
 * Re-run POSTs a fresh session with the same goal/autonomy — a new run on
 * today's data, not a replay. Recurrence stays off on re-runs; making it
 * repeat again is a deliberate choice in the /work dialog.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, FileText, RotateCcw, Repeat, Sparkles, CircleDashed, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkSessionReportDialog } from '@/components/chippi/work-session-report-dialog';
import { cn } from '@/lib/utils';
import { BODY_MUTED } from '@/lib/typography';
import type { WorkSessionRow } from '@/lib/work-sessions/types';

const ACTIVE = new Set(['planning', 'awaiting_approval', 'awaiting_input', 'running']);

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning…',
  awaiting_approval: 'Waiting for approval',
  awaiting_input: 'Waiting for your answer',
  running: 'Working…',
  completed: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type SessionWithTime = WorkSessionRow & { createdAt?: string };

export function WorkSessionsHistory({ slug }: { slug: string }) {
  const [sessions, setSessions] = useState<SessionWithTime[] | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-sessions?slug=${encodeURIComponent(slug)}&limit=50`);
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: SessionWithTime[] };
      setSessions(json.sessions);
    } catch {
      setSessions((prev) => prev ?? []);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rerun(session: SessionWithTime) {
    setNotice('');
    const res = await fetch('/api/work-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        goal: session.goal,
        autonomy: session.autonomy,
        allowQuestions: session.allowQuestions,
      }),
    });
    if (res.ok) {
      setNotice('Session restarted — watch it in the chat.');
      void load();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice(data.error || "Couldn't restart the session.");
    }
  }

  async function stopRecurrence(sessionId: string) {
    await fetch(`/api/work-sessions/${sessionId}?slug=${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop_recurrence' }),
    });
    void load();
  }

  if (sessions === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-base text-foreground">No work sessions yet.</p>
        <p className={cn(BODY_MUTED, 'mt-1.5 max-w-sm')}>
          Type <span className="font-medium text-foreground">/work</span> in the chat to hand
          Chippi a goal — it plans, works in the background, and comes back with a report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {notice && <p className="text-[12px] text-muted-foreground">{notice}</p>}
      {sessions.map((s) => (
        <HistoryCard
          key={s.id}
          session={s}
          slug={slug}
          onRerun={() => void rerun(s)}
          onStopRecurrence={() => void stopRecurrence(s.id)}
        />
      ))}
    </div>
  );
}

function HistoryCard({
  session, slug, onRerun, onStopRecurrence,
}: {
  session: SessionWithTime;
  slug: string;
  onRerun: () => void;
  onStopRecurrence: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isActive = ACTIVE.has(session.status);
  const doneCount = session.plan.filter((p) => p.status === 'done').length;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        {isActive ? (
          <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-foreground" />
        ) : session.status === 'completed' ? (
          <Sparkles size={15} className="mt-0.5 shrink-0 text-foreground" />
        ) : (
          <CircleDashed size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium leading-snug text-foreground">{session.goal}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {STATUS_LABEL[session.status] ?? session.status}
            {session.plan.length > 0 && (
              <span className="tabular-nums"> · {doneCount}/{session.plan.length} steps</span>
            )}
            {session.draftCount > 0 && (
              <span>
                {' '}· {session.draftCount} draft{session.draftCount === 1 ? '' : 's'}
              </span>
            )}
            {session.createdAt && <span> · {relativeTime(session.createdAt)}</span>}
          </p>
          {session.summary && (
            <p className="mt-1.5 line-clamp-2 text-[12px] text-muted-foreground">{session.summary}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {session.recurrence !== 'none' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                <Repeat size={10} />
                Repeats {session.recurrence}
                <button
                  type="button"
                  aria-label="Stop repeating"
                  onClick={() => {
                    setBusy(true);
                    onStopRecurrence();
                  }}
                  disabled={busy}
                  className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {session.status === 'completed' && session.artifactFileId && (
              <>
                <Button size="xs" variant="outline" onClick={() => setReportOpen(true)}>
                  <FileText size={12} />
                  View report
                </Button>
                <WorkSessionReportDialog
                  open={reportOpen}
                  onOpenChange={setReportOpen}
                  sessionId={session.id}
                  slug={slug}
                  name={session.artifactName}
                />
              </>
            )}
            {!isActive && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setBusy(true);
                  onRerun();
                  setBusy(false);
                }}
                disabled={busy}
              >
                <RotateCcw size={12} />
                Run again
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
