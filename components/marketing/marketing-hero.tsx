'use client';

/**
 * `<MarketingHero>` — the surface that opens every marketing page.
 *
 * Apple-discipline:
 * - ONE focal element: the headline. Eyebrow recedes, sub recedes further.
 * - Headline is serif Times via `var(--font-title)` — the loudest typography
 *   on the marketing site.
 * - Optional media slot sits BELOW the headline (centered + full-bleed in
 *   container width) so the eye lands on the words first, then the picture.
 *   When media is provided as a video, autoplay-mute-loop is the default —
 *   no controls, no thumbnail.
 * - Single primary CTA. A secondary ghost link is allowed but never two
 *   primaries.
 *
 * Headline + sub + CTA fade-up on mount (480ms, Apple curve). Media slot
 * fades in 120ms after, so the eye reads the words before the picture
 * announces itself.
 */

import { motion } from 'motion/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TITLE_FONT, PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';
import { MARKETING_HERO_REVEAL } from '@/lib/marketing-motion';

export interface MarketingHeroProps {
  /** Small all-caps label above the headline (e.g. "FOR REALTORS"). Optional. */
  eyebrow?: string;
  /** The page's one focal sentence. Serif Times, ~64–80px on desktop. */
  title: string;
  /** Short subtitle — one sentence. ~18–22px, muted. */
  sub?: string;
  /** Primary CTA — single button, lands first. */
  primaryCta?: { label: string; href: string };
  /** Secondary CTA — ghost link, optional. */
  secondaryCta?: { label: string; href: string };
  /** Optional media slot rendered below the words. */
  children?: React.ReactNode;
  /** Override container width. */
  className?: string;
}

export function MarketingHero({
  eyebrow,
  title,
  sub,
  primaryCta,
  secondaryCta,
  children,
  className,
}: MarketingHeroProps) {
  return (
    <section className={cn('relative pt-24 md:pt-32 pb-12 md:pb-16', className)}>
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="text-center max-w-3xl mx-auto">
          {eyebrow && (
            <motion.p
              initial="initial"
              animate="enter"
              variants={MARKETING_HERO_REVEAL}
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              {eyebrow}
            </motion.p>
          )}
          <motion.h1
            initial="initial"
            animate="enter"
            variants={MARKETING_HERO_REVEAL}
            transition={{ delay: 0.05 }}
            style={TITLE_FONT}
            className="mt-5 text-[44px] sm:text-[60px] md:text-[80px] leading-[1.02] tracking-[-0.02em] text-foreground"
          >
            {title}
          </motion.h1>
          {sub && (
            <motion.p
              initial="initial"
              animate="enter"
              variants={MARKETING_HERO_REVEAL}
              transition={{ delay: 0.12 }}
              className="mt-6 text-lg md:text-xl text-muted-foreground leading-snug"
            >
              {sub}
            </motion.p>
          )}
          {(primaryCta || secondaryCta) && (
            <motion.div
              initial="initial"
              animate="enter"
              variants={MARKETING_HERO_REVEAL}
              transition={{ delay: 0.18 }}
              className="mt-10 flex items-center justify-center gap-3 flex-wrap"
            >
              {primaryCta && (
                <Link href={primaryCta.href} className={PRIMARY_PILL}>
                  {primaryCta.label}
                </Link>
              )}
              {secondaryCta && (
                <Link href={secondaryCta.href} className={GHOST_PILL}>
                  {secondaryCta.label} <span aria-hidden>→</span>
                </Link>
              )}
            </motion.div>
          )}
        </div>
        {children && (
          <motion.div
            initial="initial"
            animate="enter"
            variants={MARKETING_HERO_REVEAL}
            transition={{ delay: 0.24 }}
            className="mt-16 md:mt-20"
          >
            {children}
          </motion.div>
        )}
      </div>
    </section>
  );
}
