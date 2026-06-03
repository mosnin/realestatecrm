'use client';

/**
 * Home v2 kit — the shared vocabulary for the rebuilt homepage. Editorial,
 * bold-sans, light-canvas aesthetic (ref: Soviet-TV / KAIRO / Stripe boards).
 *
 * Everything here is motion-aware (motion/react) and honors reduced-motion.
 * The homepage composes these; nothing here leaks into the product app.
 */

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';

export const HOME_EASE = EASE_APPLE;

/** Scroll-into-view reveal. Fades up once; reduced-motion shows instantly. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, amount: 0.25 }}
      transition={{ duration: 0.6, ease: HOME_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Stagger container + item for revealing a grid/row in sequence. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: HOME_EASE } },
};

export function Stagger({
  children,
  className,
  amount = 0.2,
}: {
  children: React.ReactNode;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}

/** Small all-caps pill label (ref: "PROCESS" / "Introduction"). */
export function Eyebrow({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'onDark' | 'brand';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]',
        tone === 'default' && 'bg-foreground/[0.06] text-foreground/70',
        tone === 'onDark' && 'bg-white/10 text-white/80',
        tone === 'brand' && 'bg-[#ff964f]/12 text-[#d2691e] dark:text-[#ff964f]',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Image placeholder — a clean, intentional empty slot the owner swaps for
 * real media. Soft neutral fill, hairline ring, centered label + ratio.
 * Not dashed/ugly — it should read as "media goes here", deliberately.
 */
export function Placeholder({
  label,
  className,
  aspect = 'aspect-[4/3]',
  tone = 'light',
}: {
  label?: string;
  className?: string;
  aspect?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      role="img"
      aria-label={label ? `Placeholder — ${label}` : 'Image placeholder'}
      className={cn(
        'relative w-full overflow-hidden rounded-3xl ring-1',
        aspect,
        tone === 'light'
          ? 'bg-gradient-to-br from-black/[0.04] to-black/[0.07] ring-black/[0.06]'
          : 'bg-white/[0.04] ring-white/[0.08]',
        className,
      )}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-6 text-center">
        <span
          className={cn(
            'text-[11px] font-medium uppercase tracking-[0.18em]',
            tone === 'light' ? 'text-black/35' : 'text-white/40',
          )}
        >
          {label ?? 'Image'}
        </span>
      </div>
    </div>
  );
}

/** Decorative ↗ / ↙ arrow chip (ref: Soviet-TV red card corners). */
export function ArrowChip({
  dir = 'up-right',
  className,
}: {
  dir?: 'up-right' | 'down-left';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex h-9 w-9 items-center justify-center', className)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="stroke-current">
        {dir === 'up-right' ? (
          <path d="M7 17 17 7M17 7H8M17 7v9" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M17 7 7 17M7 17h9M7 17V8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  );
}
