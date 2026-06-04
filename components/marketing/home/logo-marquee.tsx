'use client';

/**
 * LogoMarquee — a quiet, infinite-scrolling proof strip under the hero.
 *
 * Real brokerage marks, rendered as uniform monochrome silhouettes (black on
 * light, white on dark). Several of the source logos ship in different colors
 * (and a few are white-on-transparent), so forcing one calm tone is what makes
 * them read as a single proof strip instead of a clashing color jumble. It also
 * keeps the strip on the neutral-first, restrained aesthetic of the rest of the
 * page. Two duplicated tracks animate x: 0 -> -50% on a linear loop (the
 * standard seamless marquee). Pauses for reduced-motion.
 */

import { motion, useReducedMotion } from 'motion/react';

type Logo = { src: string; alt: string };

const LOGOS: Logo[] = [
  { src: '/marketing/logos/lpt.png', alt: 'Luxe Properties' },
  { src: '/marketing/logos/compass.png', alt: 'Compass' },
  { src: '/marketing/logos/exit.webp', alt: 'EXIT Realty' },
  { src: '/marketing/logos/remax.png', alt: 'RE/MAX' },
  { src: '/marketing/logos/source.png', alt: 'The Source Realty' },
  { src: '/marketing/logos/brokerage4.png', alt: 'Real estate brokerage' },
];

export function LogoMarquee() {
  const reduce = useReducedMotion();
  const track = [...LOGOS, ...LOGOS];

  return (
    <section className="relative py-10 md:py-14">
      <p className="mb-8 text-center text-[12px] font-medium uppercase tracking-[0.2em] text-foreground/40">
        Trusted by professionals at
      </p>

      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max items-center gap-12 md:gap-16"
          animate={reduce ? undefined : { x: ['0%', '-50%'] }}
          transition={{ duration: 32, ease: 'linear', repeat: Infinity }}
        >
          {track.map((logo, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${logo.alt}-${i}`}
              src={logo.src}
              alt={logo.alt}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-6 w-auto shrink-0 select-none object-contain opacity-50 brightness-0 md:h-8 dark:opacity-60 dark:invert"
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
