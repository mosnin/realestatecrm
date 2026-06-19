/**
 * AdminPageHeader — the one canonical page header for every admin surface.
 *
 * The status-sentence pattern, codified: a quiet eyebrow (the section the page
 * lives in), the serif H1 headline, then a single status sentence underneath.
 * Before this, ~8 admin pages hand-rolled the same `text-3xl tracking-tight`
 * h1 with an inline `fontFamily` style and an ad-hoc subtitle, so the headline
 * scale and rhythm drifted page to page. Now they import the tokens here.
 *
 * Server-safe (no 'use client'): renders identically on the server pages that
 * use it. An optional `actions` slot pins a toolbar to the right on wide
 * viewports without breaking the headline column.
 */

import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  /** The quiet small eyebrow above the title — usually the nav section
   *  ("Management.", "System.", "Growth."). Trailing period is the house voice. */
  eyebrow?: string;
  title: string;
  /** One status sentence. String or rich nodes (counts, inline badges). */
  subtitle?: React.ReactNode;
  /** Optional right-aligned toolbar (filters, primary action). */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1.5 min-w-0">
        {eyebrow && <p className={BODY_MUTED}>{eyebrow}</p>}
        <h1 className={H1} style={TITLE_FONT}>
          {title}
        </h1>
        {subtitle && <p className={BODY_MUTED}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
