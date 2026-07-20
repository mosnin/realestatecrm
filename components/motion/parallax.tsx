'use client';

/**
 * <Parallax> — a subtle scroll-linked vertical drift for accent layers
 * (hero glows, decorative art, oversized numerals). Keep `speed` small
 * (0.1–0.3): Apple-taste parallax is felt, not seen. NEVER put primary,
 * must-read content in here — only decorative depth.
 *
 *   <Parallax speed={0.2}><div className="hero-glow" /></Parallax>
 *
 * Reduced motion → static (no scroll binding at all).
 */

import { useRef, type ReactNode, type ElementType } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, prefersReducedMotion } from '@/lib/motion/gsap';

export interface ParallaxProps {
  children: ReactNode;
  /** Fraction of scroll distance to drift. 0.2 = gentle. */
  speed?: number;
  as?: ElementType;
  className?: string;
}

export function Parallax({ children, speed = 0.2, as: Tag = 'div', className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const distance = () => el.offsetHeight * speed;
      gsap.fromTo(
        el,
        { y: () => -distance() },
        {
          y: () => distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    },
    { scope: ref, dependencies: [speed] },
  );

  return (
    <Tag ref={ref} className={className} style={{ willChange: 'transform' }}>
      {children}
    </Tag>
  );
}
