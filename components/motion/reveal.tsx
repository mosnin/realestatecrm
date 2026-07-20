'use client';

/**
 * <Reveal> — the workhorse scroll-in reveal for the logged-in app.
 *
 * Wraps content; when it scrolls into view it eases from a subtle offset +
 * fade (optionally a whisper of blur/scale) to rest, once. This is the
 * Apple-restrained default: ~16px of travel, one soft expo-out, no bounce.
 * Under prefers-reduced-motion it renders the final state instantly.
 *
 *   <Reveal><StatCard .../></Reveal>
 *   <Reveal variant="blur" delay={0.1}><h1>…</h1></Reveal>
 *
 * Uses @gsap/react's useGSAP for automatic context cleanup on unmount.
 */

import { useRef, type ReactNode, type ElementType } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, ScrollTrigger, EASE, DUR, prefersReducedMotion } from '@/lib/motion/gsap';

type RevealVariant = 'rise' | 'fade' | 'blur' | 'scale';

const FROM: Record<RevealVariant, gsap.TweenVars> = {
  rise: { y: 16, opacity: 0 },
  fade: { opacity: 0 },
  blur: { y: 10, opacity: 0, filter: 'blur(8px)' },
  scale: { scale: 0.97, opacity: 0, transformOrigin: '50% 60%' },
};

export interface RevealProps {
  children: ReactNode;
  variant?: RevealVariant;
  /** Extra delay before this element starts (seconds). */
  delay?: number;
  /** Override the duration (seconds). */
  duration?: number;
  /** Fraction of the element that must be visible before it fires (0-1). */
  start?: string;
  as?: ElementType;
  className?: string;
}

export function Reveal({
  children,
  variant = 'rise',
  delay = 0,
  duration,
  start = 'top 88%',
  as: Tag = 'div',
  className,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        gsap.set(el, { clearProps: 'all' });
        return;
      }
      gsap.from(el, {
        ...FROM[variant],
        duration: duration ?? DUR.base,
        delay,
        ease: EASE,
        scrollTrigger: { trigger: el, start, once: true },
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className} style={{ willChange: 'transform, opacity' }}>
      {children}
    </Tag>
  );
}

/** Refresh ScrollTrigger after async content changes height (call sparingly). */
export function refreshScrollTriggers() {
  if (typeof window !== 'undefined') ScrollTrigger.refresh();
}
