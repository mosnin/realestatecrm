/**
 * Surface cards — the dashboard card language (2026 restyle).
 *
 * One shared vocabulary for every card-like surface on the realtor and
 * brokerage dashboards, translated from the owner's reference design:
 *
 *   - compact 16px radius, precise hairline, shallow editorial elevation
 *   - warm paper surfaces on a lightly inset canvas, generous padding
 *   - quiet medium-weight card titles with a restrained control at top-right
 *   - small stat cards with a short vertical accent bar beside the label
 *   - statuses as small rounded-full bg-muted pills
 *   - ONE graphite accent card per view (the "most alive" card)
 *   - a dot-matrix coverage viz + bottom "insight strip" pill for charts
 *
 * Everything here is SERVER-SAFE (no hooks, no client-only imports) so both
 * server pages (broker brief) and client islands (bento cells, analytics)
 * can compose the same classes.
 *
 * Color discipline: interface selection and emphasis use graphite, matching
 * the dashboard's primary controls. Brand warmth remains available to the
 * Chippi composer and identity moments rather than filling whole cards.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/* ─── Class constants (compose onto arbitrary elements) ─────────────────── */

/** The base card: warm paper, exact hairline, compact radius, shallow lift. */
export const SURFACE_CARD =
  'rounded-2xl border border-border/85 bg-card text-card-foreground ' +
  'shadow-[0_1px_1px_rgb(17_17_19/0.025),0_6px_18px_-16px_rgb(17_17_19/0.22)]';

/** Generous default padding for a surface card. */
export const SURFACE_CARD_PAD = 'p-6 sm:p-7';

/**
 * Open editorial dashboard panel. This is intentionally borderless and a
 * little rounder than the dense app card: it frames one meaningful region on
 * the shared warm dashboard canvas without turning every row into a box.
 */
export const DASHBOARD_SURFACE =
  'chippi-dashboard-panel rounded-[1.75rem] text-card-foreground';

/** A quiet inset used for controls or one selected metric inside a panel. */
export const DASHBOARD_INSET =
  'chippi-dashboard-panel-muted rounded-2xl text-card-foreground';

/** Hairline-divided dashboard row with the People/Deals interaction rhythm. */
export const DASHBOARD_ROW =
  'group/row flex min-w-0 items-start gap-3 border-t chippi-dashboard-divider ' +
  'px-2 py-3.5 -mx-2 first:border-t-0 transition-colors duration-150 ' +
  'hover:bg-foreground/[0.025] focus-within:bg-foreground/[0.025]';

/**
 * The ONE solid accent card per view — restrained graphite with white ink.
 * It echoes the reference's selected controls without turning the dashboard
 * into a field of dark panels. Same geometry as SURFACE_CARD.
 */
export const ACCENT_CARD =
  'rounded-2xl border border-[#18181a] bg-[#18181a] text-white ' +
  'dark:border-white/10 dark:bg-[#202024] ' +
  'shadow-[0_1px_1px_rgb(17_17_19/0.06),0_8px_22px_-16px_rgb(17_17_19/0.42)]';

/** Translucent white pill for controls that live ON the accent card. */
export const ACCENT_CARD_PILL =
  'inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-sm font-medium ' +
  'border border-white/15 bg-white/10 text-white hover:bg-white/15 transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

/** Quiet editorial card title — medium weight, top-left of the card. */
export const CARD_TITLE =
  'text-[17px] leading-snug font-medium tracking-[-0.01em] text-foreground';

/**
 * The single accent used for data marks (dot-matrix fills, chart accents).
 * Validated against both card surfaces — do not lighten it.
 */
export const DATA_ACCENT_HEX = '#202023';

/* ─── SurfaceCard ────────────────────────────────────────────────────────── */

export function SurfaceCard({
  className,
  accent = false,
  children,
}: {
  className?: string;
  /** Render as the view's ONE solid accent card. */
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      data-slot="surface-card"
      className={cn(accent ? ACCENT_CARD : SURFACE_CARD, SURFACE_CARD_PAD, className)}
    >
      {children}
    </section>
  );
}

/**
 * Card header row: friendly semibold title at top-left, a quiet control
 * (link, "…" menu, count pill) at top-right.
 */
export function SurfaceCardHeader({
  title,
  action,
  onAccent = false,
  className,
}: {
  title: ReactNode;
  /** Quiet top-right control (a Link, pill, or menu trigger). */
  action?: ReactNode;
  /** Title ink flips to white when the card is the accent card. */
  onAccent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className={cn(CARD_TITLE, onAccent && 'text-white')}>{title}</h2>
      {action != null && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────────── */

/**
 * Label with the reference's short vertical accent bar on its left.
 * Used inside stat cards and KPI tiles.
 */
export function AccentBarLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2 min-w-0', className)}>
      <span
        aria-hidden
        className="h-3.5 w-px shrink-0 rounded-full bg-foreground/65"
      />
      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
    </span>
  );
}

/**
 * Small stat card: white/flat surface, accent-bar label, focal number in
 * the product's serif stat voice. Pass `accent` to make it the view's one
 * solid accent card instead.
 */
export function StatCard({
  label,
  value,
  sub,
  dim = false,
  accent = false,
  className,
}: {
  label: ReactNode;
  /** Focal value — a string, number, or an AnimatedNumber island. */
  value: ReactNode;
  sub?: ReactNode;
  /** Recede the number (a cleared / zero metric). */
  dim?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(accent ? ACCENT_CARD : SURFACE_CARD, 'p-5 sm:p-6', className)}
    >
      {accent ? (
        <span className="block text-[11px] font-medium uppercase tracking-wider text-white/85">
          {label}
        </span>
      ) : (
        <AccentBarLabel>{label}</AccentBarLabel>
      )}
      <p
        className={cn(
          'mt-2 text-[25px] leading-tight tracking-tight tabular-nums',
          accent ? 'text-white' : 'text-foreground',
          dim && !accent && 'text-muted-foreground/60',
        )}
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {value}
      </p>
      {sub != null && (
        <p className={cn('mt-1 text-[11px]', accent ? 'text-white/80' : 'text-muted-foreground')}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* ─── Status pill ────────────────────────────────────────────────────────── */

/** Statuses / levels / counts as small rounded-full pills. */
export function StatusPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border/80 bg-background/75 px-2.5 py-0.5 text-xs font-medium text-foreground/80 shadow-[0_1px_1px_rgb(17_17_19/0.025)]',
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ─── Insight strip ──────────────────────────────────────────────────────── */

/**
 * The bottom-of-card "insight strip": icon + one real one-line stat +
 * chevron. Renders as a Link when `href` is given. Copy must be an HONEST
 * computed read of the data above it — never a fabricated claim.
 */
export function InsightStrip({
  icon,
  children,
  href,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  href?: string;
  className?: string;
}) {
  const inner = (
    <>
      {icon != null && (
        <span aria-hidden className="shrink-0 text-muted-foreground">
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{children}</span>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </>
  );
  const shell = cn(
    'mt-4 flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.55)]',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cn(shell, 'transition-colors hover:bg-muted')}>
        {inner}
      </Link>
    );
  }
  return <div className={shell}>{inner}</div>;
}

/* ─── Dot matrix ─────────────────────────────────────────────────────────── */

export interface DotMatrixRow {
  /** Row label (a category — pipeline stage, weekday…). */
  label: string;
  /** Filled (accent) dots — the covered / present count. */
  filled: number;
  /** Total dots on the row. Rows longer than `maxDots` are scaled down. */
  total: number;
  /** Optional trailing value (e.g. the real count) rendered after the dots. */
  value?: ReactNode;
}

/**
 * The reference's dot-matrix coverage viz: one row of filled/unfilled
 * circles per category, row labels on the left, optional axis labels below.
 * Filled = data accent, unfilled = muted. Each row carries an aria-label
 * with the REAL numbers so the encoding is never color-alone.
 */
export function DotMatrix({
  rows,
  axisLabels,
  maxDots = 12,
  className,
}: {
  rows: DotMatrixRow[];
  /** Quiet labels under the grid (e.g. scale hints or weekday initials). */
  axisLabels?: string[];
  /** Dots per row cap — longer rows scale proportionally. */
  maxDots?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {rows.map((row) => {
        const total = Math.max(row.total, 1);
        const scale = total > maxDots ? maxDots / total : 1;
        const dots = Math.max(1, Math.round(total * scale));
        const filled = Math.min(
          dots,
          row.filled > 0 ? Math.max(1, Math.round(row.filled * scale)) : 0,
        );
        return (
          <div
            key={row.label}
            role="img"
            aria-label={`${row.label}: ${row.filled} of ${row.total}`}
            className="flex items-center gap-3"
          >
            <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">
              {row.label}
            </span>
            <span className="flex flex-1 flex-wrap items-center gap-1.5">
              {Array.from({ length: dots }, (_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    'h-2.5 w-2.5 rounded-full',
                    i < filled ? 'bg-[#F25A00]' : 'bg-muted-foreground/20',
                  )}
                />
              ))}
            </span>
            {row.value != null && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.value}
              </span>
            )}
          </div>
        );
      })}
      {axisLabels && axisLabels.length > 0 && (
        <div className="flex items-center gap-3 pt-0.5">
          <span aria-hidden className="w-24 shrink-0" />
          <div className="flex flex-1 justify-between">
            {axisLabels.map((l) => (
              <span key={l} className="text-[10px] text-muted-foreground/70">
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Ghost add-row ──────────────────────────────────────────────────────── */

/**
 * The ghost "+ Add …" row at the bottom of a list card. Href-based so it
 * stays server-safe; wrap in your own button for client-side handlers.
 */
export function AddRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-xl px-2 py-3 text-sm font-medium text-muted-foreground',
        'transition-colors hover:bg-muted/50 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        className,
      )}
    >
      <span aria-hidden className="text-base leading-none">
        +
      </span>
      {children}
    </Link>
  );
}
