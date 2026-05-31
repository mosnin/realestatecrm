'use client';

/**
 * `<MarketingSection>` — the workhorse layout the homepage and product
 * pages alternate to tell a story. Apple's "tick-tock": text on one side,
 * media on the other; next section flips. The eye learns the rhythm and
 * reads the page faster.
 *
 * Apple-discipline:
 * - One headline per section. Subhead is a SINGLE sentence.
 * - Bullets are rare and short. Default to prose.
 * - Vertical breath: `py-24 md:py-32` — sections need air between them or
 *   the page reads as a brochure.
 * - No card chrome around the media — it sits on the background.
 * - Motion reveals on scroll-into-view, once per section.
 */

import { motion } from 'motion/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TITLE_FONT, GHOST_PILL } from '@/lib/typography';
import {
  MARKETING_REVEAL,
  MARKETING_VIEWPORT,
  MARKETING_STAGGER_CONTAINER,
  MARKETING_STAGGER_ITEM,
} from '@/lib/marketing-motion';

export interface MarketingSectionProps {
  /** Small all-caps tag above the headline (e.g. "INBOX"). Optional. */
  eyebrow?: string;
  /** Section headline — serif Times, ~40–56px. */
  title: string;
  /** One-sentence subtitle, muted. */
  sub?: string;
  /** Optional bullet list — short verbs, no more than 4. */
  bullets?: string[];
  /** Optional inline link rendered below copy ("Learn more →"). */
  learnMore?: { label: string; href: string };
  /** Which side the media goes on (defaults to right). */
  side?: 'left' | 'right';
  /** Stacked single-column layout — used when the section is media-only or
   *  the words are tight enough that the side-by-side tick-tock isn't needed. */
  stacked?: boolean;
  /** Media (slot or real). Sits opposite the words in tick-tock layout. */
  children?: React.ReactNode;
  /** Override container width. */
  className?: string;
}

export function MarketingSection({
  eyebrow,
  title,
  sub,
  bullets,
  learnMore,
  side = 'right',
  stacked = false,
  children,
  className,
}: MarketingSectionProps) {
  const words = (
    <div className={cn('max-w-xl', stacked && 'mx-auto text-center')}>
      {eyebrow && (
        <motion.p
          variants={MARKETING_STAGGER_ITEM}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {eyebrow}
        </motion.p>
      )}
      <motion.h2
        variants={MARKETING_STAGGER_ITEM}
        style={TITLE_FONT}
        className="mt-4 text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] tracking-[-0.02em] text-foreground"
      >
        {title}
      </motion.h2>
      {sub && (
        <motion.p
          variants={MARKETING_STAGGER_ITEM}
          className="mt-5 text-base md:text-lg text-muted-foreground leading-snug"
        >
          {sub}
        </motion.p>
      )}
      {bullets && bullets.length > 0 && (
        <motion.ul
          variants={MARKETING_STAGGER_ITEM}
          className={cn(
            'mt-6 space-y-2 text-base text-foreground/85',
            stacked && 'inline-block text-left',
          )}
        >
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-2 h-1 w-1 rounded-full bg-foreground/70 flex-shrink-0"
              />
              <span>{b}</span>
            </li>
          ))}
        </motion.ul>
      )}
      {learnMore && (
        <motion.div variants={MARKETING_STAGGER_ITEM} className="mt-8">
          <Link href={learnMore.href} className={GHOST_PILL}>
            {learnMore.label} <span aria-hidden>→</span>
          </Link>
        </motion.div>
      )}
    </div>
  );

  return (
    <motion.section
      initial="initial"
      whileInView="enter"
      viewport={MARKETING_VIEWPORT}
      variants={MARKETING_STAGGER_CONTAINER}
      className={cn('relative py-24 md:py-32', className)}
    >
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {stacked ? (
          <div className="space-y-12">
            {words}
            {children && <motion.div variants={MARKETING_REVEAL}>{children}</motion.div>}
          </div>
        ) : (
          <div
            className={cn(
              'grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center',
            )}
          >
            <motion.div
              variants={MARKETING_REVEAL}
              className={side === 'right' ? 'md:order-1' : 'md:order-2'}
            >
              {words}
            </motion.div>
            {children && (
              <motion.div
                variants={MARKETING_REVEAL}
                className={side === 'right' ? 'md:order-2' : 'md:order-1'}
              >
                {children}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
}
