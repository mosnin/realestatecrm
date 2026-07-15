'use client';

/**
 * StatGrid — the admin console's KPI row, on the surface-card language.
 *
 * Rebuilt (2026 restyle) on the shared {@link StatCard} primitive so the admin
 * dashboards speak the same borderless rounded-3xl vocabulary as the realtor /
 * brokerage dashboards. The old joined-hairline figure (gap-px slab of
 * `bg-border` cells) is gone; cells are now individual flat surface cards in a
 * gapped grid, each with the reference's short vertical accent bar beside its
 * label.
 *
 * The public API is unchanged — every existing consumer (overview, billing,
 * agent-stats, cohorts, scoring-health) keeps passing the same `StatCell[]`.
 *
 * Numeric values still count up once on entry via the shared AnimatedNumber
 * (honors reduced-motion); string values (already-formatted money, "—") render
 * as-is. An `alert` cell tints the numeral + sub amber to flag something that
 * needs eyes.
 */

import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { StatCard } from '@/components/ui/surface-card';

export interface StatCell {
  label: string;
  value: number | string;
  /** Quiet sub-line under the numeral (e.g. "+12 this week", "all clear"). */
  sub?: string;
  /** Tints the numeral + sub amber to signal "needs attention". */
  alert?: boolean;
  /** Format applied to numeric values during count-up (e.g. formatCompact). */
  format?: (n: number) => string;
}

export function StatGrid({
  cells,
  className,
  /** Column count at the sm breakpoint. Defaults to the cell count, capped at 4. */
  columnsClassName,
  'aria-label': ariaLabel = 'Key metrics',
}: {
  cells: StatCell[];
  className?: string;
  columnsClassName?: string;
  'aria-label'?: string;
}) {
  const cols =
    columnsClassName ??
    (cells.length >= 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : cells.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2');

  return (
    <section aria-label={ariaLabel} className={cn('grid gap-3 sm:gap-4', cols, className)}>
      {cells.map(({ label, value, sub, alert, format }) => {
        const inner =
          typeof value === 'number' ? (
            <AnimatedNumber value={value} format={format} />
          ) : (
            value
          );
        return (
          <StatCard
            key={label}
            label={label}
            value={
              alert ? (
                <span className="text-amber-600 dark:text-amber-400">{inner}</span>
              ) : (
                inner
              )
            }
            sub={
              sub ? (
                <span className={cn(alert && 'text-amber-600 dark:text-amber-400')}>{sub}</span>
              ) : undefined
            }
          />
        );
      })}
    </section>
  );
}
