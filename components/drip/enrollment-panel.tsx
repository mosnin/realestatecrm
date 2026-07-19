'use client';

/**
 * Per-sequence enrollment view: who's enrolled, their current step, status,
 * and stop reason — plus the "enroll a contact" affordance. Fetches its own
 * data from GET /api/drip/enroll?sequenceId= (spaceId-scoped server-side) so
 * expanding a sequence never requires the parent to have preloaded every
 * sequence's enrollments up front.
 */

import { useCallback, useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/surface-card';
import { EnrollContactDialog } from './enroll-contact-dialog';
import type { DripEnrollmentUI, DripSequenceUI, EnrollmentCounts } from './types';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const sevenDays = 7 * 24 * 60 * 60;
  if (abs > sevenDays) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const buckets: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, secs] of buckets) {
    if (abs >= secs || unit === 'second') return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, 'second');
}

function statusPillClass(status: DripEnrollmentUI['status']): string {
  switch (status) {
    case 'enrolled':
      return 'bg-[#F25A00]/10 text-[#F25A00]';
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
    case 'stopped':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

interface Props {
  slug: string;
  sequence: DripSequenceUI;
  /** Called with the freshly-loaded enrollment status breakdown, so the
   *  parent's list-view count summary (enrolled/completed/stopped) stays in
   *  sync without a second round trip. */
  onCountsChange?: (counts: EnrollmentCounts) => void;
}

function countByStatus(enrollments: DripEnrollmentUI[]): EnrollmentCounts {
  const counts: EnrollmentCounts = { enrolled: 0, completed: 0, stopped: 0 };
  for (const e of enrollments) counts[e.status] += 1;
  return counts;
}

export function EnrollmentPanel({ slug, sequence, onCountsChange }: Props) {
  const [enrollments, setEnrollments] = useState<DripEnrollmentUI[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drip/enroll?sequenceId=${encodeURIComponent(sequence.id)}`);
      if (!res.ok) {
        setError('Could not load enrollments.');
        return;
      }
      const body = (await res.json()) as { enrollments: DripEnrollmentUI[] };
      const rows = body.enrollments ?? [];
      setEnrollments(rows);
      onCountsChange?.(countByStatus(rows));
    } catch {
      setError('Could not load enrollments.');
    } finally {
      setLoading(false);
    }
    // onCountsChange is a fresh closure each render in the caller; keying the
    // effect on sequence.id (not the callback) avoids a re-fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStop(id: string) {
    setStoppingId(id);
    try {
      const res = await fetch(`/api/drip/enroll/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEnrollments((prev) => {
          if (!prev) return prev;
          const next = prev.map((e) => (e.id === id ? { ...e, status: 'stopped' as const, stopReason: 'unenrolled' } : e));
          onCountsChange?.(countByStatus(next));
          return next;
        });
      }
    } finally {
      setStoppingId(null);
    }
  }

  const totalSteps = sequence.steps.length;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Enrollments</p>
        <Button type="button" size="sm" variant="outline" onClick={() => setEnrollOpen(true)}>
          <UserPlus aria-hidden size={14} />
          Enroll a contact
        </Button>
      </div>

      <div aria-live="polite">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !enrollments || enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts enrolled yet.</p>
      ) : (
        <div className="space-y-1.5">
          {enrollments.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {e.contactName ?? 'Unknown contact'}
                </p>
                <p className="text-xs text-muted-foreground">
                  step {Math.min(e.currentStep + 1, Math.max(totalSteps, 1))} of {totalSteps || '—'} · enrolled{' '}
                  {formatRelative(e.enrolledAt)}
                  {e.status === 'stopped' && e.stopReason && ` · stopped: ${e.stopReason}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill className={statusPillClass(e.status)}>{e.status}</StatusPill>
                {e.status === 'enrolled' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStop(e.id)}
                    disabled={stoppingId === e.id}
                  >
                    {stoppingId === e.id ? 'Stopping…' : 'Stop'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      <EnrollContactDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        slug={slug}
        sequenceId={sequence.id}
        sequenceName={sequence.name}
        onEnrolled={load}
      />
    </div>
  );
}
