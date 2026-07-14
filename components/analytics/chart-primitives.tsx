'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatCompact as formatCurrency } from '@/lib/formatting';
import { STAT_NUMBER, TITLE_FONT, CAPTION, BODY_MUTED } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';
import {
  ACCENT_CARD,
  AccentBarLabel,
  CARD_TITLE,
  SURFACE_CARD,
  SURFACE_CARD_PAD,
} from '@/components/ui/surface-card';

// Re-export the shared card pieces so analytics views compose one vocabulary.
export { DotMatrix, InsightStrip, StatusPill } from '@/components/ui/surface-card';

// Re-export shadcn chart primitives
export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
export type { ChartConfig } from '@/components/ui/chart';

export { formatCurrency };

// Paper-flat chart palette — graytones only, no rainbow.
// Use these as Cell fills when a chart has multiple categories.
export const PAPER_SERIES = [
  'hsl(var(--foreground))',
  'hsl(var(--muted-foreground))',
  'hsl(var(--muted-foreground) / 0.6)',
  'hsl(var(--muted-foreground) / 0.4)',
  'hsl(var(--muted-foreground) / 0.25)',
] as const;

export const PAPER_FOREGROUND = 'hsl(var(--foreground))';
export const PAPER_MUTED = 'hsl(var(--muted-foreground))';
export const PAPER_GRID = 'hsl(var(--muted-foreground) / 0.25)';

// ── Entrance motion ───────────────────────────────────────────────────────────
//
// Every analytics surface lands as a calm fade-up cascade: the stat strip first,
// then each chart card in sequence. Cards self-drive their entrance off an
// `index` so they can live inside plain responsive grids (no shared motion
// parent needed). The stagger is CAPPED so a long column of cards never drags —
// past the cap, the delay plateaus rather than piling on. Honors
// prefers-reduced-motion: when reduced, the card renders in its final state
// instantly (no translate, no delay).

const STAGGER_STEP = 0.05;
const STAGGER_CAP = 6; // delay plateaus after this many items

/**
 * A self-contained fade-up card. `index` sets its place in the surrounding
 * cascade; the delay is capped so long lists stay snappy. When motion is
 * reduced the card is simply present with no transform or delay.
 */
export function FadeUpItem({
  children,
  className,
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const cappedDelay = reduce ? 0 : Math.min(index, STAGGER_CAP) * STAGGER_STEP;
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: cappedDelay }}
    >
      {children}
    </motion.div>
  );
}

// Stat cell — a small stat CARD: flat white surface, large radius, no
// border, with the reference's short vertical accent bar beside the label.
// Lives inside a StatStrip (a plain gap-4 grid — cards float on the canvas).
//
// Numbers render in the focal serif (TITLE_FONT) per the typography rules so
// they read as data, not labels. Pass `accent` on AT MOST ONE cell per view
// to make it the view's solid accent card.
export function StatCell({
  label,
  value,
  sub,
  format,
  accent = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** When `value` is numeric, an optional formatter (e.g. `formatCompact`). */
  format?: (n: number) => string;
  /** The view's ONE solid accent card. */
  accent?: boolean;
}) {
  return (
    <div className={cn(accent ? ACCENT_CARD : SURFACE_CARD, 'p-5 sm:p-6')}>
      {accent ? (
        <p className="text-[11px] font-medium uppercase tracking-wider text-white/85">
          {label}
        </p>
      ) : (
        <AccentBarLabel>{label}</AccentBarLabel>
      )}
      <p
        className={cn(STAT_NUMBER, 'mt-2 tabular-nums', accent && 'text-white')}
        style={TITLE_FONT}
      >
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} format={format} />
        ) : (
          value
        )}
      </p>
      {sub && (
        <p className={`text-[11px] mt-1 ${accent ? 'text-white/80' : 'text-muted-foreground/70'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * Stat strip — the KPI row that opens almost every analytics surface.
 * Post-restyle it is a plain generous-gap grid of floating stat cards
 * (no hairline dividers, no shared border). Fades up as a single unit on
 * mount so the numbers arrive with the page (each focal number then counts
 * up via the StatCell's AnimatedNumber).
 */
export function StatStrip({
  children,
  /** Override the responsive column classes. Defaults to the 2→4 strip used
   *  across the analytics surfaces. */
  cols = 'grid-cols-2 sm:grid-cols-4',
}: {
  children: React.ReactNode;
  cols?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={`grid ${cols} gap-4`}
    >
      {children}
    </motion.div>
  );
}

// Chart section — a flat, borderless, large-radius card for charts. Friendly
// semibold title top-left, an optional quiet control top-right, and an
// optional bottom "insight strip" (one HONEST computed line about the data
// above — pass it pre-composed via the `insight` prop, e.g. an
// <InsightStrip>). Built on FadeUpItem so it fades up in the surface cascade.
export function ChartSection({
  title,
  sub,
  children,
  index = 0,
  action,
  insight,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  /** Position in the surrounding fade-up cascade (caps the stagger delay). */
  index?: number;
  /** Quiet top-right control (a link, select, or "…" menu). */
  action?: React.ReactNode;
  /** Bottom insight strip — must state a real computed fact. */
  insight?: React.ReactNode;
}) {
  return (
    <FadeUpItem index={index} className={`group ${SURFACE_CARD} ${SURFACE_CARD_PAD}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={CARD_TITLE}>{title}</p>
        {action != null && <div className="shrink-0">{action}</div>}
      </div>
      {sub && <p className={`${CAPTION} mt-0.5 mb-4`}>{sub}</p>}
      {!sub && <div className="mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
      {insight}
    </FadeUpItem>
  );
}

/**
 * Quiet empty state — a faint glyph over one calm line. Used when a whole
 * surface (or a section of it) has no data yet. The glyph fades up gently so
 * the emptiness reads as intentional rest, not a missing element.
 */
export function EmptyState({
  glyph,
  children,
}: {
  glyph?: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={`${SURFACE_CARD} px-6 py-12 text-center`}
    >
      {glyph && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground/70">
          {glyph}
        </div>
      )}
      <p className={`${BODY_MUTED} max-w-sm mx-auto`}>{children}</p>
    </motion.div>
  );
}
