import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, H1, PRIMARY_PILL, TITLE_FONT } from '@/lib/typography';

type SupportingFamily =
  | 'intelligence'
  | 'operations'
  | 'inventory'
  | 'studio'
  | 'records'
  | 'intake'
  | 'control'
  | 'coordination'
  | 'service';

type SupportingWidth = 'reading' | 'content' | 'wide' | 'full';

const WIDTHS: Record<SupportingWidth, string> = {
  reading: 'max-w-3xl',
  content: 'max-w-5xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
};

/**
 * Family-owned canvas for supporting realtor routes.
 *
 * Unlike RealtorPage, this component does not imply a universal composition.
 * `family` is a durable route contract: analytics is a signal board, files are
 * a record room, settings are a control desk, and so on. The family marker is
 * deliberately visible to tests and visual QA so these pages cannot silently
 * collapse back into one title-and-card template.
 */
export function SupportingPage({
  family,
  width = 'content',
  children,
  className,
}: {
  family: SupportingFamily;
  width?: SupportingWidth;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-supporting-family={family}
      className={cn(
        'chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full pb-16 pt-3 sm:pt-5',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
/**
 * Editorial orientation block. Every real page answers four questions before
 * the work surface begins: where am I, what is true, what should I do next,
 * and what action starts that work. `layout` lets each family keep its own
 * geometry rather than inheriting a single dashboard hero.
 */
export function SupportingOrientation({
  family,
  eyebrow,
  title,
  summary,
  nextAction,
  action,
  layout = 'split',
  className,
}: {
  family: SupportingFamily;
  eyebrow: ReactNode;
  title: ReactNode;
  summary: ReactNode;
  nextAction: ReactNode;
  action?: ReactNode;
  layout?: 'split' | 'stacked' | 'rail';
  className?: string;
}) {
  const split = layout === 'split';
  const rail = layout === 'rail';

  return (
    <header
      data-page-orientation={family}
      className={cn(
        'border-b chippi-dashboard-divider pb-8 sm:pb-10',
        split && 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.38fr)] lg:items-end',
        rail && 'grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(18rem,0.28fr)] lg:items-start',
        layout === 'stacked' && 'space-y-6',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className={cn(H1, 'mt-3 max-w-4xl text-balance')} style={TITLE_FONT}>
          {title}
        </h1>
        <p data-page-summary className={cn(BODY_MUTED, 'mt-3 max-w-2xl text-pretty leading-6')}>
          {summary}
        </p>
        {action != null && (
          <div data-page-primary-action className="mt-6 flex flex-wrap items-center gap-3">
            {action}
          </div>
        )}
      </div>

      <aside
        data-page-next-action
        className={cn(
          'min-w-0 border-l-2 border-foreground/80 pl-5',
          layout === 'stacked' && 'max-w-xl',
        )}
      >
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Next best move
        </p>
        <div className="mt-2 text-[15px] leading-6 text-foreground">{nextAction}</div>
      </aside>
    </header>
  );
}

export function SupportingMetricBand({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-page-grounded-metrics
      className={cn(
        'grid divide-y chippi-dashboard-divider border-b chippi-dashboard-divider sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SupportingMetric({
  label,
  value,
  detail,
  accent = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 px-1 py-6 sm:px-5 sm:first:pl-0', className)}>
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 truncate text-[30px] leading-none tracking-tight tabular-nums',
          accent ? 'text-foreground' : 'text-foreground/88',
        )}
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {value}
      </p>
      {detail != null && <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Primary route work. Geometry is selected by the page, not the shell. */
export function SupportingWorkArea({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section data-page-primary-work className={cn('mt-9 min-w-0', className)}>
      {children}
    </section>
  );
}

export function SupportingSectionHeader({
  label,
  title,
  description,
  action,
  className,
}: {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {label != null && (
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </p>
        )}
        <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-foreground">{title}</h2>
        {description != null && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Open row group: one grounded work surface, never a grid of generic cards. */
export function SupportingRowGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mt-5 overflow-hidden border-y chippi-dashboard-divider divide-y chippi-dashboard-divider',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SupportingActionLink({
  href,
  children,
  quiet = false,
}: {
  href: string;
  children: ReactNode;
  quiet?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        quiet
          ? 'inline-flex h-9 items-center rounded-full border chippi-dashboard-divider px-4 text-sm font-medium text-foreground transition-colors hover:bg-foreground/[0.04]'
          : PRIMARY_PILL,
      )}
    >
      {children}
    </Link>
  );
}
