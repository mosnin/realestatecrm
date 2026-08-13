import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, H1, TITLE_FONT } from '@/lib/typography';

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
      className={cn(
        'flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow != null && <p className={BODY_MUTED}>{eyebrow}</p>}
        <h1 className={H1} style={TITLE_FONT}>
          {title}
        </h1>
        {description != null && <p className={BODY_MUTED}>{description}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </header>
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
