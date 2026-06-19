/**
 * Shared, presentational portal pieces used across dashboard + detail. Pure
 * server-safe components (no client hooks) so they can render in RSC.
 */
import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TITLE_FONT } from '@/lib/typography';

/* ─── Status pill ─────────────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  // application statuses
  received: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  under_review: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  needs_info: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  tour_scheduled: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/15',
  approved: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  waitlisted: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  declined: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
  // tour statuses
  scheduled: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  confirmed: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  completed: 'text-muted-foreground bg-muted',
  cancelled: 'text-muted-foreground bg-muted',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  under_review: 'Under review',
  needs_info: 'Needs info',
  tour_scheduled: 'Tour scheduled',
  approved: 'Approved',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function StatusPill({ status }: { status: string }) {
  const key = status.toLowerCase();
  const tone = STATUS_TONE[key] ?? 'text-muted-foreground bg-muted';
  const label = STATUS_LABEL[key] ?? status.replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      {label}
    </span>
  );
}

/* ─── Deal progress pill ────────────────────────────────────────────────────
 * The client-facing, friendly progress label for a deal. We NEVER render the
 * raw Deal.status / stage kind to a client; this maps the sanctioned
 * ClientDealProgress values (see lib/client-deals.ts) to warm language + tone.
 */

const DEAL_PROGRESS_TONE: Record<string, string> = {
  in_progress: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  under_contract: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/15',
  closing: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  closed: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  on_hold: 'text-muted-foreground bg-muted',
  fell_through: 'text-muted-foreground bg-muted',
};

const DEAL_PROGRESS_LABEL: Record<string, string> = {
  in_progress: 'In progress',
  under_contract: 'Under contract',
  closing: 'Closing',
  closed: 'Closed',
  on_hold: 'On hold',
  fell_through: 'Closed out',
};

export function DealProgressPill({ progress }: { progress: string }) {
  const tone = DEAL_PROGRESS_TONE[progress] ?? 'text-muted-foreground bg-muted';
  const label = DEAL_PROGRESS_LABEL[progress] ?? progress.replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      {label}
    </span>
  );
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */

/**
 * Portal empty state — warm, not a dashed grey box. A soft brand-tinted
 * Sparkles disc (the same warm-orange identity tint the intake hero uses
 * for its monogram — sanctioned brand context, not chrome), a serif
 * headline that matches every other focal moment in the portal, and a
 * single calm line of "what's next". An optional action slot lets the
 * caller drop a CTA in without the empty state dead-ending the client.
 */
export function PortalEmptyState({
  headline,
  whatsNext,
  action,
}: {
  headline: string;
  whatsNext: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-card px-6 py-12 text-center">
      <span
        aria-hidden
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400"
      >
        <Sparkles size={20} strokeWidth={1.75} />
      </span>
      <p className="text-lg tracking-tight text-foreground" style={TITLE_FONT}>
        {headline}
      </p>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {whatsNext}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ─── Loading skeleton ────────────────────────────────────────────────────── */

/**
 * Portal page skeleton — honours the same neutral, paper-flat vocabulary
 * the real portal pages use (serif-height header slug, rounded card rows)
 * so the route transition reads as the same product loading, not a
 * different screen. Used by the per-route loading.tsx files so navigation
 * inside the portal never flashes blank.
 */
export function PortalSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <main
      className="mx-auto max-w-3xl space-y-12 px-4 py-10 pb-16 sm:px-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted/50" />
      </div>
      <div className="space-y-4">
        <div className="h-3 w-20 animate-pulse rounded bg-muted/50" />
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-4">
              <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-muted/60" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-muted/40" />
              </div>
              <div className="h-5 w-16 animate-pulse rounded-full bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

/* ─── Date formatting ─────────────────────────────────────────────────────── */

export function formatTourDate(iso: string | null): string {
  if (!iso) return 'Time to be set';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Nullable date formatter for deal dates (close date, milestone due dates). */
export function formatDealDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
