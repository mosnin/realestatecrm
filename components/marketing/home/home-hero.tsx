'use client';

/**
 * HomeHero — the opening. One emotional idea: the agent runs the work, you
 * close the deals. Bold-sans headline, warm backdrop, the product floating
 * with annotation callouts that draw in (ref: KAIRO "Intelligence now has a
 * presence"). Everything fades up on load on the Apple curve.
 */

import Link from 'next/link';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Play } from 'lucide-react';
import { Placeholder } from './home-kit';
import { GradientBackground } from '@/components/ui/paper-design-shader-background';

const EASE = [0.22, 1, 0.36, 1] as const;

const CALLOUTS = [
  { label: 'Drafts every reply', side: 'left', top: '24%' },
  { label: 'Books the tour', side: 'right', top: '34%' },
  { label: 'Scores each lead', side: 'left', top: '64%' },
  { label: 'Keeps the pipeline current', side: 'right', top: '72%' },
] as const;

export function HomeHero() {
  const reduce = useReducedMotion();

  const rise: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 22 }, show: { opacity: 1, y: 0 } };
  const container: Variants = {
    show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
  };

  return (
    <section className="relative overflow-hidden bg-[#f3f3f4] dark:bg-[#0a0a0b]">
      {/* Animated grain-gradient shader (paper-design) — the warm "presence"
          backdrop. Adapts colorBack per theme. */}
      <GradientBackground />
      {/* Adaptive scrim — mutes the shader to a soft wash so the headline
          reads as dark-on-light / light-on-dark. `bg-background` flips with
          the theme, so one class covers both modes. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/45" />
      {/* Bottom fade into the page canvas so the shader doesn't hard-cut. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#f3f3f4] dark:to-[#0a0a0b]"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-12 md:px-8 md:pt-28">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-4xl text-center"
        >
          <motion.div variants={rise} transition={{ duration: 0.5, ease: EASE }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-medium text-foreground/70 ring-1 ring-black/[0.06] dark:bg-white/10 dark:ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff964f]" />
              The agentic OS for real estate
            </span>
          </motion.div>

          <motion.h1
            variants={rise}
            transition={{ duration: 0.6, ease: EASE }}
            className="mt-7 text-[clamp(2.75rem,7vw,5.5rem)] font-bold leading-[0.98] tracking-[-0.03em] text-foreground"
          >
            You close the deals.
            <br />
            <span className="text-[#ff964f]">Chippi does the rest.</span>
          </motion.h1>

          <motion.p
            variants={rise}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-foreground/60 md:text-xl"
          >
            Chippi reads your inbox, drafts replies in your voice, books the
            tours, and keeps every deal current — the busywork runs itself, and
            nothing leaves without your name on it.
          </motion.p>

          <motion.div
            variants={rise}
            transition={{ duration: 0.6, ease: EASE }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background transition-transform duration-150 active:scale-[0.98]"
            >
              Start free
            </Link>
            <Link
              href="/features/chippi"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-medium text-foreground ring-1 ring-black/[0.08] transition-colors hover:bg-black/[0.02] dark:bg-white/10 dark:ring-white/15 dark:hover:bg-white/[0.16]"
            >
              <Play size={15} className="fill-current" /> Watch demo
            </Link>
          </motion.div>
        </motion.div>

        {/* Product + callouts */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 36, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: EASE, delay: reduce ? 0 : 0.45 }}
          className="relative mx-auto mt-14 max-w-5xl md:mt-20"
        >
          <Placeholder label="Product — the Chippi workspace" aspect="aspect-[16/10]" />

          {/* Annotation callouts — desktop only; draw in after the product. */}
          {CALLOUTS.map((c, i) => (
            <motion.div
              key={c.label}
              aria-hidden
              className="absolute hidden lg:flex items-center gap-2"
              style={{
                top: c.top,
                [c.side]: '-2.5rem',
              }}
              initial={{ opacity: 0, x: c.side === 'left' ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : 1.0 + i * 0.12 }}
            >
              {c.side === 'right' && (
                <span className="h-px w-8 bg-foreground/20" />
              )}
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-white/10 dark:ring-white/15">
                {c.label}
              </span>
              {c.side === 'left' && <span className="h-px w-8 bg-foreground/20" />}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
