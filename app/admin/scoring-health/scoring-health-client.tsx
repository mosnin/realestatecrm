'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Loader2,
  Check,
  Building2,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import type { SpaceFailureRow, FailedLeadRow } from './page';
import { EmptyState } from '@/components/ui/empty-state';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';
import { StatGrid } from '@/app/admin/components/stat-grid';
import { SURFACE_CARD } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';
import { SECTION_LABEL, CAPTION, META } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

type Stats = {
  totalContacts: number;
  totalScored: number;
  totalFailed: number;
  totalPending: number;
  failed24h: number;
  failed7d: number;
};

type RowState = 'idle' | 'loading' | 'success' | 'error';

export function ScoringHealthClient({
  stats,
  perSpace,
  failedLeads,
}: {
  stats: Stats;
  perSpace: SpaceFailureRow[];
  failedLeads: FailedLeadRow[];
}) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const scoredRate =
    stats.totalContacts > 0
      ? Math.round((stats.totalScored / stats.totalContacts) * 100)
      : 0;
  const failedRate =
    stats.totalContacts > 0
      ? Math.round((stats.totalFailed / stats.totalContacts) * 100)
      : 0;

  // Only 24h + 7d failure counts exist; the 7-day window is the useful one. (A
  // date-range picker here previously drove the LABEL — 24h/30d/90d/365d — while
  // the value stayed the 7-day count, which read as a different number per range.)
  const failedInPeriod = stats.failed7d;

  async function retry(contactId: string) {
    setRowState((s) => ({ ...s, [contactId]: 'loading' }));
    setRowMessage((s) => ({ ...s, [contactId]: '' }));
    try {
      const res = await fetch('/api/admin/scoring/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        scoringStatus?: string;
        scoreLabel?: string | null;
        error?: string;
      };
      if (!res.ok || !data.success) {
        setRowState((s) => ({ ...s, [contactId]: 'error' }));
        setRowMessage((s) => ({
          ...s,
          [contactId]: data.error || `Failed (${data.scoringStatus ?? 'unknown'})`,
        }));
        return;
      }
      setRowState((s) => ({ ...s, [contactId]: 'success' }));
      setRowMessage((s) => ({
        ...s,
        [contactId]: `Rescored: ${data.scoreLabel ?? data.scoringStatus ?? 'ok'}`,
      }));
      // Fade row out after a beat
      setTimeout(() => {
        setHidden((prev) => {
          const next = new Set(prev);
          next.add(contactId);
          return next;
        });
      }, 1500);
    } catch (err) {
      setRowState((s) => ({ ...s, [contactId]: 'error' }));
      setRowMessage((s) => ({
        ...s,
        [contactId]: err instanceof Error ? err.message : 'Network error',
      }));
    }
  }

  const visibleFailed = failedLeads.filter((l) => !hidden.has(l.id));

  return (
    <div className="space-y-12 pb-12">
      <AdminPageHeader
        eyebrow="System."
        title="Scoring health"
        subtitle="Monitor AI scoring failures and retry from a single place."
      />

      {/* Pulse stats — one hairline grid, neutral. The failure cell tints
          amber only when there's something to look at. */}
      <StatGrid
        aria-label="Scoring metrics"
        cells={[
          { label: 'Total contacts', value: stats.totalContacts, sub: `${scoredRate}% scored` },
          { label: 'Scored', value: stats.totalScored, sub: `${scoredRate}% of all` },
          {
            label: 'Failed',
            value: stats.totalFailed,
            sub: `${failedRate}% of all`,
            alert: stats.totalFailed > 0,
          },
          { label: 'Pending', value: stats.totalPending, sub: 'awaiting scoring' },
        ]}
      />

      {/* Failure trend — two quiet figures */}
      <StatGrid
        aria-label="Failure trend"
        columnsClassName="grid-cols-2"
        cells={[
          {
            label: 'Failed · last 7 days',
            value: failedInPeriod,
            sub: 'rolling window',
            alert: failedInPeriod > 0,
          },
          {
            label: 'Failed · all time',
            value: stats.totalFailed,
            sub: 'across all contacts',
          },
        ]}
      />

      {/* Per-space failures */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Top spaces by failure count</p>
        {perSpace.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No failed scoring on any space."
            description="When the model fails to score a lead, the workspace shows up here."
            size="sm"
          />
        ) : (
          <ul className={cn(SURFACE_CARD, 'divide-y divide-border/60 overflow-hidden')}>
            {perSpace.map((row) => (
              <li key={row.spaceId} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-foreground/[0.05] flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} className="text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  {row.spaceSlug ? (
                    <Link
                      href={`/s/${row.spaceSlug}`}
                      className="text-sm font-medium truncate hover:underline underline-offset-2"
                    >
                      {row.spaceName || row.spaceSlug || row.spaceId}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium truncate">
                      {row.spaceName || row.spaceId}
                    </p>
                  )}
                  {row.spaceSlug && (
                    <p className={cn(CAPTION, 'truncate')}>/{row.spaceSlug}</p>
                  )}
                </div>
                <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {row.failedCount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Failed leads */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className={SECTION_LABEL}>Recent failed leads</p>
          <span className={CAPTION}>{visibleFailed.length} shown</span>
        </div>
        {visibleFailed.length === 0 ? (
          <EmptyState
            icon={Check}
            title="Nothing waiting to be rescored."
            description="Leads you retry disappear from this list once they score."
            size="sm"
          />
        ) : (
          <ul className={cn(SURFACE_CARD, 'divide-y divide-border/60 overflow-hidden')}>
            <AnimatePresence initial={false}>
              {visibleFailed.map((lead) => {
                const state = rowState[lead.id] ?? 'idle';
                const msg = rowMessage[lead.id];
                return (
                  <motion.li
                    key={lead.id}
                    layout
                    exit={{ opacity: 0, height: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } }}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {lead.name || 'Unnamed lead'}
                        </p>
                        {lead.spaceSlug && (
                          <Link
                            href={`/s/${lead.spaceSlug}`}
                            className="text-[10px] font-medium text-foreground/70 bg-foreground/[0.06] rounded-full px-2 py-0.5 hover:underline"
                          >
                            {lead.spaceSlug}
                          </Link>
                        )}
                      </div>
                      <p className={cn(CAPTION, 'truncate')}>
                        {lead.scoreSummary || 'No summary available'}
                      </p>
                      <p className={cn(META, 'mt-0.5')}>
                        {new Date(lead.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      {msg && (
                        <p
                          className={cn(
                            'text-[11px] mt-0.5',
                            state === 'success'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : state === 'error'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground',
                          )}
                        >
                          {msg}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 flex-shrink-0"
                      disabled={state === 'loading' || state === 'success'}
                      onClick={() => retry(lead.id)}
                    >
                      {state === 'loading' ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : state === 'success' ? (
                        <Check size={13} className="text-emerald-500" />
                      ) : (
                        <RefreshCw size={13} />
                      )}
                      {state === 'loading'
                        ? 'Retrying'
                        : state === 'success'
                          ? 'Done'
                          : 'Retry'}
                    </Button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </div>
  );
}
