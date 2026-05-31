'use client';

/**
 * `<MarketingCTA>` — bottom-of-page call to action. Single primary, single
 * secondary at most. Lives inside its own padded section with generous
 * vertical breath so the CTA reads as an arrival, not an interruption.
 *
 * The primary pill performs a SINGLE scale pulse the first time it enters
 * the viewport — 1 → 1.02 → 1 over 240ms. One beat, then still. The
 * secondary CTA stays calm; only the primary earns the pulse, because
 * only the primary is the one decision the page is asking for. Reduced
 * motion: no pulse at all.
 */

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TITLE_FONT, PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';
import { MARKETING_REVEAL, MARKETING_VIEWPORT } from '@/lib/marketing-motion';
import { EASE_APPLE } from '@/lib/motion';

export interface MarketingCTAProps {
  title: string;
  sub?: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  className?: string;
}

export function MarketingCTA({
  title,
  sub,
  primaryCta,
  secondaryCta,
  className,
}: MarketingCTAProps) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      initial="initial"
      whileInView="enter"
      viewport={MARKETING_VIEWPORT}
      variants={MARKETING_REVEAL}
      className={cn('relative py-32 md:py-40', className)}
    >
      <div className="mx-auto max-w-3xl px-6 md:px-8 text-center">
        <h2
          style={TITLE_FONT}
          className="text-[40px] sm:text-[52px] md:text-[64px] leading-[1.05] tracking-[-0.02em] text-foreground"
        >
          {title}
        </h2>
        {sub && (
          <p className="mt-5 text-lg md:text-xl text-muted-foreground leading-snug">
            {sub}
          </p>
        )}
        <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
          <motion.div
            className="inline-flex"
            initial={false}
            whileInView={reduced ? undefined : { scale: [1, 1.02, 1] }}
            viewport={MARKETING_VIEWPORT}
            transition={{ duration: 0.24, ease: EASE_APPLE }}
          >
            <Link href={primaryCta.href} className={PRIMARY_PILL}>
              {primaryCta.label}
            </Link>
          </motion.div>
          {secondaryCta && (
            <Link href={secondaryCta.href} className={GHOST_PILL}>
              {secondaryCta.label} <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  );
}
