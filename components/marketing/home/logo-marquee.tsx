'use client';

/**
 * LogoMarquee — a quiet, infinite-scrolling proof strip under the hero.
 * Logos are placeholders until real brokerage marks land. Two duplicated
 * tracks animate x: 0 → -50% on a linear loop (the standard seamless
 * marquee). Pauses for reduced-motion.
 */

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

const ITEMS = Array.from({ length: 8 }, (_, i) => `Brokerage ${i + 1}`);

export function LogoMarquee() {
  const reduce = useReducedMotion();
  const track = [...ITEMS, ...ITEMS];

  return (
    <section className="relative py-10 md:py-14">
      <p className="mb-7 text-center text-[12px] font-medium uppercase tracking-[0.2em] text-foreground/40">
        Trusted by teams that move
      </p>

      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max items-center gap-6"
          animate={reduce ? undefined : { x: ['0%', '-50%'] }}
          transition={{ duration: 32, ease: 'linear', repeat: Infinity }}
        >
          {track.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className={cn(
                'flex h-16 w-44 shrink-0 items-center justify-center rounded-2xl',
                'bg-card ring-1 ring-border/70',
              )}
            >
              <span className="text-[13px] font-semibold uppercase tracking-wider text-foreground/30">
                {name}
              </span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
