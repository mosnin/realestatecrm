import { cn } from '@/lib/utils';

interface PageTitleProps {
  /** The page title — large serif, tracking-tight. */
  children: React.ReactNode;
  /** One-line muted subtitle below the title. Optional. */
  subtitle?: React.ReactNode;
  /** Right-aligned slot for actions (Run, Add, Filter, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * The product's primary page header. One typographic system across the app:
 * 3xl serif title face (var(--font-title)), tight tracking, optional muted
 * subtitle, optional right-aligned action slot. Lives in /chippi greeting,
 * /chippi/activity, /chippi/memory, Settings, People, Pipeline, and any
 * other top-level page so the type voice stays the same wherever the user
 * lands.
 */
export function PageTitle({ children, subtitle, actions, className }: PageTitleProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="space-y-1.5 min-w-0">
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {children}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </header>
  );
}
