import {
  DASHBOARD_INSET,
  DASHBOARD_ROW,
  DASHBOARD_SURFACE,
} from '@/components/ui/surface-card';

/**
 * Brokerage dashboard presentation contract.
 *
 * Broker pages keep their existing data and interaction components, but share
 * the same open, warm editorial vocabulary as Chippi Today and People. These
 * are class constants rather than wrappers so server pages, client islands,
 * forms, tables, and drag/drop boards can adopt the system without changing
 * their component or state boundaries.
 */
export const BROKER_PAGE =
  'min-h-full space-y-8 pb-12 text-foreground';

export const BROKER_PAGE_READING =
  'mx-auto min-h-full w-full max-w-5xl space-y-8 pb-12 text-foreground';

export const BROKER_PAGE_WIDE =
  'mx-auto min-h-full w-full max-w-[1500px] space-y-8 pb-12 text-foreground';

export const BROKER_HERO =
  `${DASHBOARD_SURFACE} relative overflow-hidden p-6 sm:p-9 lg:p-11`;

export const BROKER_PANEL =
  `${DASHBOARD_SURFACE} p-5 sm:p-7`;

export const BROKER_PANEL_DENSE =
  `${DASHBOARD_SURFACE} p-4 sm:p-5`;

export const BROKER_INSET =
  `${DASHBOARD_INSET} p-4 sm:p-5`;

export const BROKER_EMPTY =
  `${DASHBOARD_INSET} px-5 py-10 text-center`;

export const BROKER_ROW = DASHBOARD_ROW;

export const BROKER_DIVIDED_LIST =
  'divide-y divide-border/60';

export const BROKER_CONTROL =
  'inline-flex min-h-9 items-center justify-center rounded-full border border-border/80 bg-[var(--dashboard-paper)] px-4 text-sm font-medium text-foreground transition-colors hover:bg-[var(--dashboard-paper-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';

export const BROKER_CONTROL_QUIET =
  'inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--dashboard-paper-muted)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const BROKER_STATUS =
  'inline-flex items-center rounded-full border border-border/80 bg-[var(--dashboard-paper-muted)] px-2.5 py-0.5 text-[11px] font-medium text-foreground/75';
