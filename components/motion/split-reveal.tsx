'use client';

/**
 * <SplitReveal> — Apple-style text reveal: the string is split into words (each
 * clipped by an overflow mask) that rise into place with a fine stagger, once,
 * as it scrolls in. Optional per-character mode for shorter headlines.
 *
 *   <SplitReveal as="h1" className={H1} text="Good morning, Jane" />
 *   <SplitReveal by="char" text="Chippi" />
 *
 * Accessibility: the full text stays as real, selectable, screen-reader-visible
 * content — the split spans carry aria-hidden and the original text sits in an
 * sr-only node. Reduced motion → plain text, no split, no animation.
 *
 * No premium GSAP SplitText plugin is used — a tiny local word/char splitter
 * keeps it dependency-free and fully in our control.
 */

import { useRef, type ElementType } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, EASE, DUR, prefersReducedMotion } from '@/lib/motion/gsap';
import { cn } from '@/lib/utils';

export interface SplitRevealProps {
  text: string;
  by?: 'word' | 'char';
  as?: ElementType;
  delay?: number;
  stagger?: number;
  start?: string;
  className?: string;
}

export function SplitReveal({
  text,
  by = 'word',
  as: Tag = 'span',
  delay = 0,
  stagger,
  start = 'top 90%',
  className,
}: SplitRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = prefersReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      const parts = el.querySelectorAll<HTMLElement>('[data-split-part]');
      if (parts.length === 0) return;
      gsap.from(parts, {
        yPercent: 115,
        duration: DUR.slow,
        delay,
        ease: EASE,
        stagger: stagger ?? (by === 'char' ? 0.03 : 0.05),
        scrollTrigger: { trigger: el, start, once: true },
      });
    },
    { scope: ref, dependencies: [text, by] },
  );

  // Reduced motion (or SSR before hydration): render plain, honest text.
  if (reduced) {
    return <Tag className={className}>{text}</Tag>;
  }

  const tokens = by === 'char' ? Array.from(text) : text.split(/(\s+)/);

  return (
    <Tag ref={ref} className={cn('inline', className)} aria-label={text}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {tokens.map((tok, i) => {
          if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
          return (
            <span
              key={i}
              className="inline-block overflow-hidden align-bottom"
              style={{ paddingBottom: '0.08em', marginBottom: '-0.08em' }}
            >
              <span data-split-part className="inline-block" style={{ willChange: 'transform' }}>
                {tok}
              </span>
            </span>
          );
        })}
      </span>
    </Tag>
  );
}
