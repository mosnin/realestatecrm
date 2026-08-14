import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, H1, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

type PageWidth = 'reading' | 'content' | 'wide' | 'full';

const WIDTH_CLASS: Record<PageWidth, string> = {
  reading: 'max-w-3xl',
  content: 'max-w-5xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
};

/**
 * Route-owned frame for realtor pages that share Today's editorial canvas.
 *
 * The authenticated LayoutShell supplies viewport scrolling and responsive
 * gutters. This component only locks the page's vertical rhythm and width, so
 * feature layouts (kanban, calendar, editors, galleries) keep their behavior.
 * It is intentionally server-safe and can be imported by client pages too.
 */
export function RealtorPage({
  children,
  width = 'content',
  className,
}: {
  children: ReactNode;
  width?: PageWidth;
  className?: string;
}) {
  return (
    <div
      data-realtor-page="today"
      className={cn(
        'chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full space-y-8 pb-12 pt-3 sm:pt-5',
        WIDTH_CLASS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One calm page title: muted context, serif focal line, one status sentence. */
export function RealtorPageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-realtor-page-orientation
      className={cn(
        'flex flex-col gap-7 border-b chippi-dashboard-divider pb-8 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pb-10',
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl space-y-2.5">
        {eyebrow != null && <p className={SECTION_LABEL}>{eyebrow}</p>}
        <h1 className={cn(H1, 'text-4xl sm:text-5xl')} style={TITLE_FONT}>
          {title}
        </h1>
        {description != null && (
          <p className={cn(BODY_MUTED, 'max-w-2xl text-[15px] leading-relaxed')}>{description}</p>
        )}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** Quiet heading above a page-specific working region. */
export function RealtorSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-realtor-section-heading
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow != null && <p className={SECTION_LABEL}>{eyebrow}</p>}
        <h2 className="mt-1 text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
          {title}
        </h2>
        {description != null && <p className={cn(BODY_MUTED, 'mt-1 max-w-2xl')}>{description}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** One open, hairline-divided outcome strip; metrics are not separate cards. */
export function RealtorOutcomeStrip({
  items,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; detail?: ReactNode }>;
  className?: string;
}) {
  return (
    <dl
      data-realtor-outcomes
      className={cn(
        'chippi-dashboard-panel grid overflow-hidden rounded-[1.75rem] sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="min-w-0 border-t chippi-dashboard-divider px-6 py-6 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(even)]:border-l lg:border-l lg:border-t-0 lg:first:border-l-0"
        >
          <dt className={SECTION_LABEL}>{item.label}</dt>
          <dd className="mt-2 text-3xl tracking-tight text-foreground" style={TITLE_FONT}>
            {item.value}
          </dd>
          {item.detail != null && <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </dl>
  );
}

/** Borderless warm paper for one meaningful region, not every individual row. */
export function RealtorPanel({
  children,
  className,
  as: Component = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  return (
    <Component className={cn('chippi-dashboard-panel rounded-[1.75rem] p-6 sm:p-8', className)}>
      {children}
    </Component>
  );
}

/** Flat records belong in one paper panel separated by hairlines. */
export function RealtorRowList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'chippi-dashboard-panel overflow-hidden rounded-[1.75rem] divide-y chippi-dashboard-divider px-5 sm:px-7',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Empty states explain what will appear here without a decorative mascot. */
export function RealtorEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <RealtorPanel className={cn('py-12 text-center sm:py-16', className)}>
      <p className="text-[17px] font-medium text-foreground">{title}</p>
      {description != null && (
        <p className={cn(BODY_MUTED, 'mx-auto mt-1.5 max-w-md')}>{description}</p>
      )}
      {action != null && <div className="mt-5 flex justify-center">{action}</div>}
    </RealtorPanel>
  );
}
