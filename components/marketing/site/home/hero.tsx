'use client';

/**
 * Hero — the gradient-card opener.
 *
 * One huge rounded canvas card filled with the owner's GrainGradient shader
 * (vermillion → gold → raspberry, theme-aware, reduced-motion parks it),
 * with the promise set in the display face and an italic-serif accent.
 * White pill primary on the hot surface; glass secondary. Honest trial line.
 *
 * Replaces the full-screen video hero (placeholder VC copy) — the gradient
 * card is the brand's first impression now.
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { GradientBackground } from '@/components/ui/paper-design-shader-background';
import { Accent } from '@/components/marketing/site/section';
import { EASE_OUT } from '@/lib/motion';

function Enter({
  delay,
  children,
  className,
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="px-3 pb-3 pt-20 sm:px-4 sm:pb-4 sm:pt-24">
      <div className="relative mx-auto flex min-h-[78vh] max-w-7xl flex-col items-center justify-center overflow-hidden rounded-[2rem] px-5 py-20 text-center sm:rounded-[2.75rem] sm:px-10">
        <GradientBackground />
        {/* Scrim — keeps the headline readable over the hot zone. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/25" />

        <Enter delay={0.05}>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
            <span aria-hidden>✦</span>
            Meet Chippi — your AI teammate
          </p>
        </Enter>

        <Enter delay={0.15}>
          <h1 className="font-display mx-auto mt-7 max-w-4xl text-balance text-5xl font-bold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Your leads, worked <Accent>while you close.</Accent>
          </h1>
        </Enter>

        <Enter delay={0.3}>
          <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-white/85 sm:text-lg">
            Chippi reads every inbound, drafts replies in your voice, books the
            tours, and keeps your pipeline current — approval-first, always.
          </p>
        </Enter>

        <Enter delay={0.45}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-[#141414] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 bg-white/10 px-7 text-[15px] font-semibold text-white backdrop-blur-sm transition-colors duration-150 hover:bg-white/20"
            >
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-white/70">7 days free, then $97/mo. Cancel anytime.</p>
        </Enter>
      </div>
    </section>
  );
}
