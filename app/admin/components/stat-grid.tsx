'use client';

/**
 * StatGrid — the hairline "pulse stats" grid, codified for the admin console.
 *
 * The Overview and Billing pages already use this exact figure: cells joined
 * by 1px hairlines (`gap-px` over a `bg-border/60` slab, each cell painted
 * `bg-background`) inside one rounded, clipped frame. Scoring-health,
 * agent-stats and cohorts hand-rolled four separate `Card`s with colored icon
 * chips and ad-hoc `text-[25px]` numerals instead — louder, heavier, and off
 * the type ladder. This component makes the dense, scannable figure the
 * default everywhere.
 *
 * Numeric values count up once on entry via the shared AnimatedNumber (honors
 * reduced-motion); string values (already-formatted money, "—") render as-is.
 * An `alert` cell tints the numeral amber to flag something that needs eyes.
 */

import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { SECTION_LABEL, STAT_NUMBER_COMPACT, META } from '@/lib/typography';

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
    <section
      aria-label={ariaLabel}
      className={cn(
        'grid gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60',
        cols,
        className,
      )}
    >
      {cells.map(({ label, value, sub, alert, format }) => (
        <div key={label} className="bg-background px-4 py-4 sm:px-5 sm:py-5">
          <p className={cn(SECTION_LABEL, 'mb-2')}>{label}</p>
          <p
            className={cn(
              STAT_NUMBER_COMPACT,
              alert && 'text-amber-600 dark:text-amber-400',
            )}
          >
            {typeof value === 'number' ? (
              <AnimatedNumber value={value} format={format} />
            ) : (
              value
            )}
          </p>
          {sub && (
            <p
              className={cn(
                META,
                'mt-1',
                alert && 'text-amber-600/80 dark:text-amber-400/80',
              )}
            >
              {sub}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
