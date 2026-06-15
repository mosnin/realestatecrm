'use client';

/**
 * Giga marketing primitives — the shared kit for the dark, cinematic
 * marketing redesign.
 *
 * The visual language (matching the reference; copy stays Chippi/real-estate):
 *  - Near-black sections, generous air, thin hairline dividers.
 *  - Light-weight SERIF display headlines (Fraunces, via --font-serif-display
 *    set on the marketing layout). Body in the app sans.
 *  - Eyebrow labels: UPPERCASE MONOSPACE (--font-mono-display, JetBrains Mono)
 *    with a small colored dot. No emoji — the dot is a styled <span>.
 *  - Rounded-full white "pill" CTAs.
 *
 * Motion is the installed framer-motion; everything respects
 * prefers-reduced-motion (the BlurRise primitive falls back to a plain block).
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/* ── Serif display headline ─────────────────────────────────────────────── */

/** The elegant thin serif headline face (Fraunces). Light weight by default. */
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
      style={{ fontFamily: 'var(--font-serif-display)' }}
      className={cn('font-light tracking-[-0.01em]', className)}
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
      style={{ fontFamily: 'var(--font-mono-display)' }}
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('inline-block size-1.5 rounded-full bg-[#ff7a45]', dotClassName)}
      />
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

/** Ghost pill — hairline border, transparent fill ("Talk to us"). */
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
    <section id={id} className={cn('px-5 sm:px-8', className)}>
      <div className={cn('mx-auto w-full max-w-6xl', innerClassName)}>{children}</div>
    </section>
  );
}
