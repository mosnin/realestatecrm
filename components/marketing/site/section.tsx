'use client';

/**
 * The marketing section system — "bold canvas" edition.
 *
 * The page is a tinted canvas; content lives in big rounded color-blocked
 * cards that alternate and build rhythm (white paper, soft tint, signal
 * vermillion, true black). Display type is Inter Tight (--font-display),
 * the accent flourish is Instrument Serif italic (--font-accent), and the
 * signal color does real brand work — eyebrow glyphs, kickers, stats, CTAs.
 *
 * Exports (API stable so every page rides the system):
 * - <Section tone>    — plain | card (paper) | tint | brand (vermillion) | dark
 * - <SectionHeader>   — ✦ chip eyebrow → big display headline → sub
 * - <Accent>          — italic serif accent span inside a headline
 * - <FeatureGrid>     — tinted feature cells: kicker → title → body
 * - <StatStrip>       — the giant-number cells row (92% / +30% / 500k style)
 * - <DarkStatBand>    — black card with display stats
 * - <FadeUp>/<Stagger>/<StaggerItem>/<Parallax> — scroll motion, reduced-aware
 */

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/* ── Motion primitives ─────────────────────────────────────────────────── */

export function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({
  children,
  className,
  gap = 0.08,
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Subtle scroll-linked drift for imagery/panels. */
export function Parallax({
  children,
  amount = 40,
  className,
}: {
  children: React.ReactNode;
  amount?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return (
    <motion.div ref={ref} style={reduce ? undefined : { y }} className={className}>
      {children}
    </motion.div>
  );
}

/* ── The signal accent + accent serif ──────────────────────────────────── */

/** Italic serif accent inside a display headline — the "Revolutionize" move. */
export function Accent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <em className={cn('font-accent font-normal italic tracking-normal', className)}>{children}</em>
  );
}

/** ✦-glyph eyebrow chip. `light` flips it for dark/brand surfaces. */
export function EyebrowChip({
  children,
  light = false,
  className,
}: {
  children: React.ReactNode;
  light?: boolean;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em]',
        light ? 'text-white/85' : 'text-[#141414]/70 dark:text-white/70',
        className,
      )}
    >
      <span aria-hidden className={cn('text-[13px] leading-none', light ? 'text-white' : 'text-[#ff4b29]')}>
        ✦
      </span>
      {children}
    </p>
  );
}

/* ── Section + header ──────────────────────────────────────────────────── */

type Tone = 'plain' | 'card' | 'tint' | 'brand' | 'dark';

const TONE_SURFACE: Record<Exclude<Tone, 'plain'>, string> = {
  // Paper card on the canvas — the default content surface.
  card: 'bg-white text-[#141414] dark:bg-[#151517] dark:text-[#f5f5f4] shadow-[0_1px_2px_rgba(20,16,12,0.04),0_12px_40px_-18px_rgba(20,16,12,0.12)]',
  // A half-step off the canvas — quiet grouping.
  tint: 'bg-[#e9e9ee] text-[#141414] dark:bg-[#141416] dark:text-[#f5f5f4]',
  // The signal block — vermillion doing brand work.
  brand: 'bg-[#ff4b29] text-white',
  // The contrast band.
  dark: 'bg-[#0d0d0f] text-white',
};

export function Section({
  tone = 'plain',
  className,
  innerClassName,
  children,
}: {
  /** plain = bare canvas band · card = white paper · tint = canvas half-step · brand = vermillion · dark = black */
  tone?: Tone;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  if (tone === 'plain') {
    return (
      <section className={cn('px-4 py-16 sm:px-6 sm:py-24', className)}>
        <div className={cn('mx-auto max-w-6xl', innerClassName)}>{children}</div>
      </section>
    );
  }
  return (
    <section className={cn('px-3 py-3 sm:px-4 sm:py-4', className)}>
      <FadeUp>
        <div
          className={cn(
            'mx-auto max-w-7xl overflow-hidden rounded-[2rem] sm:rounded-[2.75rem]',
            TONE_SURFACE[tone],
            innerClassName,
          )}
        >
          <div className="px-5 py-14 sm:px-10 sm:py-20 lg:px-14">{children}</div>
        </div>
      </FadeUp>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
  align = 'left',
  dark = false,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  align?: 'left' | 'center';
  /** White-text treatment — pass on `brand` and `dark` tones. */
  dark?: boolean;
  className?: string;
}) {
  return (
    <FadeUp
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      <EyebrowChip light={dark}>{eyebrow}</EyebrowChip>
      <h2
        className={cn(
          'font-display mt-5 text-[2rem] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[2.75rem]',
          dark ? 'text-white' : 'text-[#141414] dark:text-white',
        )}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            'mt-4 max-w-xl text-base leading-relaxed sm:text-lg',
            align === 'center' && 'mx-auto',
            dark ? 'text-white/70' : 'text-[#141414]/65 dark:text-white/60',
          )}
        >
          {sub}
        </p>
      ) : null}
    </FadeUp>
  );
}

/* ── Feature grid — tinted cells, kicker → title → body ────────────────── */

export interface FeatureCell {
  kicker: string;
  title: string;
  body: string;
}

export function FeatureGrid({
  items,
  columns = 3,
  className,
}: {
  items: FeatureCell[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <Stagger
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4',
        columns === 3 && 'lg:grid-cols-3',
        columns === 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {items.map((f) => (
        <StaggerItem key={f.title}>
          <div className="group h-full rounded-3xl bg-[#f4f4f6] p-7 transition-transform duration-200 hover:-translate-y-1 dark:bg-[#1c1c1f]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff4b29] dark:text-[#ff8a5c]">
              {f.kicker}
            </p>
            <h3 className="font-display mt-3 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#141414] dark:text-white">
              {f.title}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-[#141414]/60 dark:text-white/55">{f.body}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ── Stat strip — the giant-number cells (92% / +30% / 500k look) ──────── */

export function StatStrip({
  stats,
  className,
}: {
  stats: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Stagger
      className={cn(
        'grid grid-cols-2 gap-3 sm:gap-4',
        stats.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        className,
      )}
    >
      {stats.map((s) => (
        <StaggerItem key={s.label}>
          <div className="h-full rounded-3xl bg-[#f4f4f6] px-6 py-8 dark:bg-[#1c1c1f]">
            <p className="font-display text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-[#141414] dark:text-white sm:text-[3.25rem]">
              {s.value}
            </p>
            <p className="mt-3 text-[13px] font-medium text-[#141414]/55 dark:text-white/55">{s.label}</p>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

/* ── Dark stat band ─────────────────────────────────────────────────────── */

export function DarkStatBand({
  eyebrow,
  title,
  stats,
}: {
  eyebrow: string;
  title: string;
  stats: { value: string; label: string }[];
}) {
  return (
    <Section tone="dark">
      <div className="flex flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader dark eyebrow={eyebrow} title={title} />
        <Stagger className="grid flex-shrink-0 grid-cols-3 gap-8 sm:gap-12">
          {stats.map((s) => (
            <StaggerItem key={s.label}>
              <p className="font-display text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-none tracking-[-0.03em] text-[#ff7a47]">
                {s.value}
              </p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">{s.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
