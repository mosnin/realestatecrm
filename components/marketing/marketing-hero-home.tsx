'use client';

/**
 * `<MarketingHeroHome>` — the full-bleed opening hero for the logged-out
 * homepage (`/`). Adapted from an "aero" hero reference (full-screen image,
 * dark overlay, vertical grid divider lines, centered headline, animated-arrow
 * CTA) but rebuilt ON-BRAND for Chippi: serif headline (--font-title), the
 * brand orange (--brand #ff964f) on the CTA, real-estate imagery, and our own
 * primitives — no @base-ui Button, no foreign theme tokens.
 *
 * Lives in components/marketing/ (not /components/ui) because it's a marketing
 * composition, not a reusable shadcn primitive. The shared <MarketingHero>
 * (used on ~10 other marketing pages) is deliberately left untouched.
 *
 * Text is white over a dark-overlaid image, so it reads identically in light
 * and dark. Entrance fades up on the Apple curve; honors reduced-motion.
 */

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion, type Variants } from 'motion/react';

export interface HeroCta {
  label: string;
  href: string;
}

export interface MarketingHeroHomeProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  primaryCta: HeroCta;
  secondaryCta?: HeroCta;
  /** Full-bleed background image. Defaults to a modern-home photo. */
  imageUrl?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// A modern luxury home — served locally from /public (no external dependency,
// satisfies the 'self' img-src CSP). Swap the file to rebrand the hero.
const DEFAULT_IMAGE = '/marketing/home-hero.jpg';

export function MarketingHeroHome({
  eyebrow,
  title,
  sub,
  primaryCta,
  secondaryCta,
  imageUrl = DEFAULT_IMAGE,
}: MarketingHeroHomeProps) {
  const reduce = useReducedMotion();

  const rise: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0 },
      };
  const container: Variants = {
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
  };

  return (
    <section className="relative flex h-[92vh] min-h-[600px] w-full items-center justify-center overflow-hidden">
      {/* Background image + overlays */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
      >
        <div className="absolute inset-0 bg-black/55" />
        {/* Settle the image into the page below the fold. */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-black/45" />
      </div>

      {/* Signature aero grid divider lines (asymmetric, framing the center). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
        <div className="grid h-full w-full grid-cols-12 divide-x divide-white/[0.12]">
          <div className="col-span-1 h-full" />
          <div className="col-span-3 h-full" />
          <div className="col-span-4 h-full" />
          <div className="col-span-3 h-full" />
          <div className="col-span-1 h-full" />
        </div>
      </div>

      {/* Content */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-20 mx-auto max-w-4xl px-6 text-center text-white"
      >
        {eyebrow && (
          <motion.p
            variants={rise}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-white/70"
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1
          variants={rise}
          transition={{ duration: 0.6, ease: EASE }}
          className="text-balance text-5xl font-normal leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {title}
        </motion.h1>

        {sub && (
          <motion.p
            variants={rise}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto mt-6 max-w-2xl text-lg font-light text-white/85 md:text-xl"
          >
            {sub}
          </motion.p>
        )}

        <motion.div
          variants={rise}
          transition={{ duration: 0.6, ease: EASE }}
          className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row"
        >
          {/* Primary CTA — two-piece pill with the animated arrow swap, in
              Chippi orange; inverts to near-black on hover. */}
          <Link
            href={primaryCta.href}
            aria-label={primaryCta.label}
            className="group flex items-center gap-1"
          >
            <span className="rounded-full bg-[#ff964f] px-7 py-3.5 font-medium text-[#1b1206] transition-colors duration-500 ease-in-out group-hover:bg-[#111113] group-hover:text-[#ff964f]">
              {primaryCta.label}
            </span>
            <span className="relative flex h-[52px] w-[52px] items-center overflow-hidden rounded-full bg-[#ff964f] text-[#1b1206] transition-colors duration-500 ease-in-out group-hover:bg-[#111113] group-hover:text-[#ff964f]">
              <ArrowUpRight className="absolute left-1/2 h-5 w-5 -translate-x-1/2 transition-transform duration-500 ease-in-out group-hover:translate-x-12" />
              <ArrowUpRight className="absolute left-1/2 h-5 w-5 -translate-x-12 transition-transform duration-500 ease-in-out group-hover:-translate-x-1/2" />
            </span>
          </Link>

          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="text-sm font-medium text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              {secondaryCta.label}
            </Link>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}
