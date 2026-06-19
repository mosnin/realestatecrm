'use client';

/**
 * BriefKpiTile — the brokerage brief's hairline-grid stat cell, with the
 * focal numeral counting up on entry.
 *
 * This is the broker-side sibling of components/properties/commission-stat-cell
 * and components/motion/animated-stat-cell: identical paper-flat geometry
 * (bg-background, SECTION_LABEL → serif focal number → optional sub) so the
 * brief's numeric vocabulary is unchanged. The only lift is motion — the
 * number ticks up via the shared AnimatedNumber (which honors
 * prefers-reduced-motion, so reduced-motion users see the final figure
 * instantly). Money and counts are the loudest signal on the broker's
 * dashboard; letting them land makes the figure something the owner *watches*.
 *
 * Nothing here changes data, links, counts, or actions — the same numbers the
 * server computed are handed in as props. A tile can render:
 *   - an animated numeric `value` (with an optional `format` like formatCompact), or
 *   - a static `display` node (for non-numeric cells like "Lead → App" or a
 *     realtor's name) so every cell on the grid shares one frame.
 */

import type { ReactNode } from 'react';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { SECTION_LABEL, TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';

interface BriefKpiTileProps {
  label: string;
  /** Numeric value to count up. Ignored when `display` is provided. */
  value?: number;
  /** Format the animated number (e.g. formatCompact). */
  format?: (n: number) => string;
  /** Static node rendered in place of the animated number (non-numeric cells). */
  display?: ReactNode;
  /** Optional muted sub-line beneath the number. */
  sub?: ReactNode;
  /** Icon rendered inline-left of the label (matches the member dashboard). */
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** Recede the number (a cleared / zero metric). */
  dim?: boolean;
  className?: string;
}

export function BriefKpiTile({
  label,
  value,
  format,
  display,
  sub,
  icon: Icon,
  dim,
  className,
}: BriefKpiTileProps) {
  return (
    <div className={cn('bg-background p-4', className)}>
      <p className={cn(SECTION_LABEL, Icon && 'flex items-center gap-1.5')}>
        {Icon && <Icon size={11} className="text-muted-foreground" aria-hidden />}
        {label}
      </p>
      <p
        className={cn(
          'text-2xl tracking-tight tabular-nums mt-1.5 text-foreground',
          dim && 'text-muted-foreground/60',
        )}
        style={TITLE_FONT}
      >
        {display ?? (
          <AnimatedNumber value={value ?? 0} format={format} />
        )}
      </p>
      {sub != null && (
        <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
      )}
    </div>
  );
}
