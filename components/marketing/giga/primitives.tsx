'use client';

/**
 * Giga marketing primitives — the shared kit for the dark, cinematic redesign.
 *
 * Visual language (matches the reference; copy stays Chippi/real-estate):
 *  - Near-black sections, generous air, thin hairline dividers.
 *  - Large, THIN, high-contrast SERIF display headlines (Fraunces at high
 *    optical size, via --font-serif-display set on the marketing layout). A
 *    scoped rule in globals.css already makes the serif the default for every
 *    heading in the shell; the <Serif> helper just pins the size/weight knobs.
 *  - Eyebrow labels: UPPERCASE MONOSPACE (--font-mono-display, JetBrains Mono)
 *    with a small colored dot. No emoji — the dot is a styled <span>.
 *  - Rounded-full white "pill" CTAs.
 *
 * Motion is the installed framer-motion; everything respects
 * prefers-reduced-motion (BlurRise falls back to a plain block).
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/** Shared accent (warm Chippi orange) used sparingly across the redesign. */
export const ACCENT = '#ff7a45';

/* ── Serif display headline ─────────────────────────────────────────────── */

/**
 * The elegant thin serif headline face. The scoped CSS in globals.css already
 * resolves --font-serif-display + high optical size for every heading in the
 * shell; this component just guarantees the light weight + tracking knobs and
 * keeps the inline font as belt-and-suspenders so a headline is never left on
 * the global sans.
 */
export function Serif({
  children,
  className,
  as: Tag = 'h2',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'p';
}) {
  return (
    <Tag
      style={{
        fontFamily: 'var(--font-serif-display), Georgia, serif',
        fontVariationSettings: '"opsz" 144',
      }}
      className={cn('font-light tracking-[-0.02em]', className)}
    >
      {children}
    </Tag>
  );
}

/* ── Eyebrow: uppercase mono + colored dot ──────────────────────────────── */

export function Eyebrow({
  children,
  className,
  dotClassName,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override the dot color (defaults to the warm brand orange). */
  dotClassName?: string;
}) {
  return (
    <span
      style={{ fontFamily: 'var(--font-mono-display), ui-monospace, monospace' }}
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('inline-block size-1.5 rounded-full', dotClassName)}
        style={dotClassName ? undefined : { backgroundColor: ACCENT }}
      />
      {children}
    </span>
  );
}

/** A glassy rounded eyebrow PILL (the hero / sub-page hero treatment). */
export function EyebrowPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 backdrop-blur-md',
        className,
      )}
    >
      <Eyebrow>{children}</Eyebrow>
    </span>
  );
}

/* ── Mono label (footers, stat captions) ────────────────────────────────── */

export function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      style={{ fontFamily: 'var(--font-mono-display), ui-monospace, monospace' }}
      className={cn('uppercase tracking-[0.2em]', className)}
    >
      {children}
    </span>
  );
}

/* ── Pill CTAs ──────────────────────────────────────────────────────────── */

type PillProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  withArrow?: boolean;
};

/** Solid white pill — the primary CTA ("See a demo"). */
export function PillPrimary({ href, children, className, withArrow }: PillProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-[14px] font-medium text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98]',
        className,
      )}
    >
      {children}
      {withArrow ? (
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );
}

/** Ghost pill — hairline border, transparent fill ("Explore X" / "Talk to us"). */
export function PillGhost({ href, children, className, withArrow }: PillProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-6 text-[14px] font-medium text-white transition-colors duration-200 hover:border-white/40 hover:bg-white/[0.04]',
        className,
      )}
    >
      {children}
      {withArrow ? (
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );
}

/* ── Motion: blur-rise (the redesign's entrance language) ────────────────── */

/**
 * The signature entrance: fade + small rise + de-blur. Used on-load for the
 * hero and on-scroll (whileInView) for sections. Reduced-motion → plain block.
 */
export function BlurRise({
  children,
  className,
  delay = 0,
  /** `load` animates on mount; `scroll` animates when it enters the viewport. */
  trigger = 'scroll',
  y = 22,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  trigger?: 'load' | 'scroll';
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;

  const initial = { opacity: 0, y, filter: 'blur(12px)' };
  const shown = { opacity: 1, y: 0, filter: 'blur(0px)' };
  const transition = { duration: 0.9, ease: EASE_OUT, delay };

  if (trigger === 'load') {
    return (
      <motion.div className={className} initial={initial} animate={shown} transition={transition}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      initial={initial}
      whileInView={shown}
      viewport={{ once: true, margin: '-80px' }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/* ── Section shell ──────────────────────────────────────────────────────── */

/** A standard near-black section band with consistent horizontal gutters. */
export function Band({
  children,
  className,
  innerClassName,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('px-5 sm:px-8 lg:px-10', className)}>
      <div className={cn('mx-auto w-full max-w-[1728px]', innerClassName)}>{children}</div>
    </section>
  );
}
