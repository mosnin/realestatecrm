'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { formatCompact as formatCurrency } from '@/lib/formatting';
import { STAT_NUMBER, TITLE_FONT, CAPTION, H3, BODY_MUTED } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';

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

// Stat cell — for use inside the connected stat strip (gap-px, bg-border/70).
// Wrap in a parent: <div className="grid grid-cols-X gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
//
// Numbers render in the focal serif (TITLE_FONT) per the typography rules so
// they read as data, not labels.
export function StatCell({
  label,
  value,
  sub,
  format,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** When `value` is numeric, an optional formatter (e.g. `formatCompact`). */
  format?: (n: number) => string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER} style={TITLE_FONT}>
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} format={format} />
        ) : (
          value
        )}
      </p>
      <p className={`${CAPTION} mt-1`}>{label}</p>
      {sub && (
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

/**
 * Connected stat strip — the four-cell hairline-divided KPI row that opens
 * almost every analytics surface. Fades up as a single unit on mount so the
 * numbers arrive with the page (each focal number then counts up via the
 * StatCell's AnimatedNumber). Geometry is byte-identical to the inline grid it
 * replaces, so the loading skeleton dissolves straight into it.
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
      className={`grid ${cols} gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70`}
    >
      {children}
    </motion.div>
  );
}

// Chart section — paper-flat surface for charts.
// Title uses H3 (card heading) and sub uses caption-tone muted text so the
// type hierarchy is consistent across analytics surfaces.
//
// The hairline border brightens a hair on hover so a dense grid of cards feels
// alive under the cursor without any color or shadow bloom — pure neutral
// fit-and-finish. Built on FadeUpItem so it fades up in the surface cascade.
export function ChartSection({
  title,
  sub,
  children,
  index = 0,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  /** Position in the surrounding fade-up cascade (caps the stagger delay). */
  index?: number;
}) {
  return (
    <FadeUpItem
      index={index}
      className="group rounded-xl border border-border/70 bg-background p-5 transition-colors duration-200 hover:border-border"
    >
      <p className={H3}>{title}</p>
      {sub && <p className={`${CAPTION} mt-0.5 mb-4`}>{sub}</p>}
      {!sub && <div className="mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
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
      className="rounded-xl border border-border/70 bg-background px-6 py-12 text-center"
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
