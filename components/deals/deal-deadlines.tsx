import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';
import { roleLabel } from '@/lib/deals/roles';
import { dealHealth, HEALTH_META } from '@/lib/deals/health';
import type { DealChecklistItem } from '@/lib/deals/checklist';
import type { Deal, DealContactRole } from '@/lib/types';

/**
 * DealDeadlines — the contract-to-close cockpit read.
 *
 * A calm, dated view of the deal's contingencies: what's coming, who's on the
 * hook, and what's at risk. It reads the SAME `DealChecklistItem` rows the
 * checklist editor below renders — a deadline IS a dated checklist item — so
 * there's one source of truth. This surface is read-only by design: adding,
 * dating, and ticking happens in the checklist beneath it. STYLESHEET.md
 * §Surfaces §Rows: divide-y timeline, no card chrome per row.
 *
 * Server component — no interactivity, so no client bundle.
 */

interface DealDeadlinesProps {
  /** The deal's checklist items (the deadline rows). From the SSR-fetched deal. */
  items: DealChecklistItem[];
  /**
   * Deal fields the at-risk read needs — reuses lib/deals/health.ts. Dates are
   * ISO strings (what the SSR row carries), not Date objects; dealHealth parses
   * them internally, the same way the kanban card feeds it.
   */
  deal: {
    status: Deal['status'];
    closeDate: string | null;
    followUpAt: string | null;
    nextAction: string | null;
    nextActionDueAt: string | null;
    stageChangedAt?: string | null;
    updatedAt?: string | null;
  };
}

const MS_PER_DAY = 86_400_000;

function startOfTodayUTC(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole-day delta from today (UTC) to a due date. Negative = overdue. */
function daysUntil(dueAt: string): number | null {
  const t = new Date(dueAt).getTime();
  if (isNaN(t)) return null;
  const dueDay = Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate());
  return Math.round((dueDay - startOfTodayUTC()) / MS_PER_DAY);
}

function fmtDue(dueAt: string): string {
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "in 3 days" / "due today" / "2 days overdue" / "today" for completed. */
function timingLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`;
  if (days === 0) return 'due today';
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function DealDeadlines({ items, deal }: DealDeadlinesProps) {
  // Dated, open items are the contingency clock. Completed + undated rows live
  // in the checklist below; the cockpit is the dated read.
  const dated = items
    .filter((i) => i.dueAt)
    .map((i) => ({ item: i, days: daysUntil(i.dueAt as string) }))
    .filter((x) => x.days != null) as { item: DealChecklistItem; days: number }[];
  dated.sort((a, b) => new Date(a.item.dueAt as string).getTime() - new Date(b.item.dueAt as string).getTime());

  const open = dated.filter((x) => !x.item.completedAt);
  const overdue = open.filter((x) => x.days < 0);

  // dealHealth's input type declares Date for the date fields but parses them
  // through `new Date(...)` at runtime, so ISO strings are the real contract
  // (the kanban card feeds it the same way). Cast through unknown to satisfy
  // the nominal Date type without round-tripping through Date objects.
  const health = dealHealth({
    status: deal.status,
    stageChangedAt: (deal.stageChangedAt ?? null) as unknown as Deal['stageChangedAt'],
    updatedAt: (deal.updatedAt ?? undefined) as unknown as Deal['updatedAt'],
    closeDate: deal.closeDate as unknown as Deal['closeDate'],
    followUpAt: deal.followUpAt as unknown as Deal['followUpAt'],
    nextAction: deal.nextAction,
    nextActionDueAt: deal.nextActionDueAt as unknown as Deal['nextActionDueAt'],
  });
  const meta = HEALTH_META[health.state];

  // The at-risk read: overdue deadlines are the sharpest signal — lead with
  // them. Otherwise fall back to the deal-health reason, or the next due item.
  const next = open[0];
  let riskLine: string;
  if (overdue.length > 0) {
    riskLine =
      overdue.length === 1
        ? `${overdue[0].item.label} is ${timingLabel(overdue[0].days)}.`
        : `${overdue.length} deadlines are overdue.`;
  } else if (health.reason) {
    // dealHealth reasons are lowercase fragments ("closing in 2 days").
    riskLine = `${health.reason.charAt(0).toUpperCase()}${health.reason.slice(1)}.`;
  } else if (next) {
    riskLine = `Next: ${next.item.label} ${timingLabel(next.days)}.`;
  } else {
    riskLine = 'No dated deadlines yet.';
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={SECTION_LABEL}>Contract to close</p>
        {open.length > 0 && (
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {open.length} open{overdue.length > 0 ? ` · ${overdue.length} overdue` : ''}
          </p>
        )}
      </div>

      {/* At-risk read — the one focal line. Health dot + sentence. */}
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-xl border border-border/70 bg-card px-4 py-3',
        )}
      >
        <span
          className={cn('mt-1 h-2 w-2 flex-shrink-0 rounded-full', meta.dotClass)}
          aria-hidden
        />
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', meta.textClass)}>{meta.label}</p>
          <p className="text-sm text-muted-foreground">{riskLine}</p>
        </div>
      </div>

      {/* Dated timeline. Empty → calm pointer to the checklist below. */}
      {dated.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
          <p className="text-sm text-foreground">No dated deadlines yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add dates to the checklist below and Chippi will track them.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
          {dated.map(({ item, days }) => {
            const done = !!item.completedAt;
            const isOverdue = !done && days < 0;
            const roles = (item.assignedRoles ?? []).filter(Boolean) as DealContactRole[];
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-center gap-3 bg-card px-4 py-3',
                  done && 'opacity-60',
                )}
              >
                {/* Status dot — done is a check, open is a hairline ring. */}
                <span className="flex-shrink-0">
                  {done ? (
                    <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <span
                      className={cn(
                        'block h-[15px] w-[15px] rounded-full border-2',
                        isOverdue ? 'border-rose-500' : 'border-border',
                      )}
                      aria-hidden
                    />
                  )}
                </span>

                {/* Label + role chips. */}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm text-foreground truncate', done && 'line-through')}>
                    {item.label}
                  </p>
                  {roles.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {roles.map((role) => (
                        <span
                          key={role}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {roleLabel(role) ?? role}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Due date + timing. Overdue in destructive tone. */}
                <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                  <span className="text-sm tabular-nums text-foreground">{fmtDue(item.dueAt as string)}</span>
                  {done ? (
                    <span className="text-[11px] text-muted-foreground">done</span>
                  ) : isOverdue ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                      <AlertTriangle size={11} />
                      {timingLabel(days)}
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">{timingLabel(days)}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
