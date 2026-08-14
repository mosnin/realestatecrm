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

export const BROKER_PAGE_HEADER =
  'flex flex-col gap-7 border-b chippi-dashboard-divider pb-8 pt-2 sm:flex-row sm:items-end sm:justify-between sm:pb-10';

export const BROKER_PAGE_TITLE =
  'text-4xl tracking-tight text-foreground sm:text-5xl [font-family:var(--font-title)]';

export const BROKER_PAGE_DESCRIPTION =
  'max-w-2xl text-[15px] leading-relaxed text-muted-foreground';

export const BROKER_OUTCOME_STRIP =
  `${DASHBOARD_SURFACE} grid overflow-hidden sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0 [&>*]:px-6 [&>*]:py-6 [&>*]:border-t [&>*]:border-border/60 [&>*:first-child]:border-t-0 sm:[&>*:nth-child(-n+2)]:border-t-0 sm:[&>*:nth-child(even)]:border-l lg:[&>*]:border-l lg:[&>*]:border-t-0 lg:[&>*:first-child]:border-l-0`;

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

/**
 * Route-family geometry. These intentionally describe different working
 * surfaces instead of putting every broker route inside the same card stack.
 * The page owns its content; these constants only lock the macro composition.
 */
export const BROKER_ORIENTATION =
  'text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground';

export const BROKER_COMMAND_HERO =
  'grid gap-8 border-b chippi-dashboard-divider pb-9 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] lg:items-end';

export const BROKER_FINANCE_HERO =
  'grid gap-7 rounded-[2rem] bg-foreground px-6 py-7 text-background sm:px-9 sm:py-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end';

export const BROKER_DIRECTORY_SHELL =
  'grid min-h-[34rem] overflow-hidden rounded-[1.75rem] bg-[var(--dashboard-paper)] shadow-[0_1px_2px_rgb(17_17_19/0.035),0_16px_40px_-32px_rgb(17_17_19/0.32)] lg:grid-cols-[15rem_minmax(0,1fr)]';

export const BROKER_BOARD_SHELL =
  'overflow-hidden rounded-[1.75rem] border chippi-dashboard-divider bg-[var(--dashboard-paper-muted)] p-3 sm:p-5';

export const BROKER_SETTINGS_SHELL =
  'grid items-start gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]';
