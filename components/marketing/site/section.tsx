'use client';

/**
 * The marketing section system — ONE vocabulary for every page.
 *
 * Every section on every marketing page is built from these pieces so the
 * whole site reads as a single product:
 *
 * - <Section tone>      — the container. `card` is the Apple move: a big
 *                         rounded-[2.5rem] surface that breaks up the page;
 *                         `dark` is the charcoal stat band; `plain` is bare.
 * - <SectionHeader>     — eyebrow (small caps) → serif Times headline →
 *                         muted sub. The ONLY section-heading treatment.
 * - <FadeUp>/<Stagger>  — the scroll-reveal language (framer-motion,
 *                         whileInView, reduced-motion aware).
 * - <Parallax>          — subtle scroll-linked drift for imagery.
 * - <FeatureGrid>       — the standard 3/4-up feature cells: kicker + title
 *                         + body. No decorative icon chips — type carries it.
 * - <DarkStatBand>      — the rounded charcoal band of serif stats.
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

/** Subtle scroll-linked drift (the "framer feel") for imagery/panels. */
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

/* ── Section + header ──────────────────────────────────────────────────── */

export function Section({
  tone = 'plain',
  className,
  innerClassName,
  children,
}: {
  /** plain = bare band · card = rounded Apple surface · dark = charcoal card */
  tone?: 'plain' | 'card' | 'dark';
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
}) {
  if (tone === 'plain') {
    return (
      <section className={cn('px-4 py-20 sm:px-6 sm:py-28', className)}>
        <div className={cn('mx-auto max-w-6xl', innerClassName)}>{children}</div>
      </section>
    );
  }
  return (
    <section className={cn('px-4 py-6 sm:px-6 sm:py-8', className)}>
      <FadeUp>
        <div
          className={cn(
            'mx-auto max-w-7xl overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]',
            tone === 'card' && 'border border-border/60 bg-muted/30',
            tone === 'dark' && 'bg-[#111113] text-white',
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
      <p
        className={cn(
          'text-[11px] font-medium uppercase tracking-[0.18em]',
          dark ? 'text-white/45' : 'text-muted-foreground',
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          'mt-4 text-3xl leading-[1.12] tracking-tight sm:text-[2.5rem]',
          dark ? 'text-white' : 'text-foreground',
        )}
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            'mt-4 max-w-xl text-base leading-relaxed',
            align === 'center' && 'mx-auto',
            dark ? 'text-white/55' : 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      ) : null}
    </FadeUp>
  );
}

/* ── Feature grid — type-first, no decorative icon chips ───────────────── */

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
        'grid grid-cols-1 gap-4 sm:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3',
        columns === 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {items.map((f) => (
        <StaggerItem key={f.title}>
          <div className="h-full rounded-3xl border border-border/60 bg-background p-7 transition-colors duration-200 hover:border-border">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-brand">{f.kicker}</p>
            <h3 className="mt-3 text-[17px] font-semibold leading-snug text-foreground">{f.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
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
      <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <SectionHeader dark eyebrow={eyebrow} title={title} />
        <Stagger className="grid flex-shrink-0 grid-cols-3 gap-10">
          {stats.map((s) => (
            <StaggerItem key={s.label}>
              <p
                className="text-[clamp(2rem,5vw,3.25rem)] leading-none tracking-tight text-brand"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                {s.value}
              </p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-white/45">{s.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}
