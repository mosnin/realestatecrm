'use client';

/**
 * <StaggerReveal> — reveals its DIRECT children one after another as the group
 * scrolls into view. The signature "cards cascade in" motion for dashboards,
 * lists, and bento grids. Restrained: 14px rise, expo-out, ~60ms apart.
 *
 *   <StaggerReveal className="grid gap-4">
 *     <Card/> <Card/> <Card/>
 *   </StaggerReveal>
 *
 * Children animate as-is (no wrapper element added around each), so grid/flex
 * layouts are untouched. Reduced-motion → everything visible instantly.
 */

import { useRef, type ReactNode, type ElementType } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap, EASE, DUR, STAGGER, prefersReducedMotion } from '@/lib/motion/gsap';

export interface StaggerRevealProps {
  children: ReactNode;
  /** Seconds between each child. */
  stagger?: number;
  delay?: number;
  /** Travel distance in px. */
  distance?: number;
  start?: string;
  /**
   * Anti-runaway guardrails (Apple-taste: a cascade must never make the user
   * wait). At most `maxCount` children are individually staggered; any beyond
   * that appear with the group (no per-item delay), so a 100-row list can't
   * take ~6s to finish. The whole cascade is also clamped to `maxWindow`
   * seconds total — the effective per-child stagger shrinks as count grows.
   */
  maxCount?: number;
  maxWindow?: number;
  as?: ElementType;
  className?: string;
}

export function StaggerReveal({
  children,
  stagger = STAGGER,
  delay = 0,
  distance = 14,
  start = 'top 85%',
  maxCount = 24,
  maxWindow = 0.8,
  as: Tag = 'div',
  className,
}: StaggerRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const kids = Array.from(el.children) as HTMLElement[];
      if (kids.length === 0) return;
      if (prefersReducedMotion()) {
        gsap.set(kids, { clearProps: 'all' });
        return;
      }
      // Only the first `maxCount` items cascade; the rest are already in place
      // so a long list never blocks reading. Effective stagger also shrinks so
      // the animated window never exceeds `maxWindow` seconds.
      const animated = kids.slice(0, maxCount);
      const effStagger = Math.min(stagger, maxWindow / Math.max(1, animated.length));
      gsap.from(animated, {
        y: distance,
        opacity: 0,
        duration: DUR.base,
        delay,
        ease: EASE,
        stagger: effStagger,
        scrollTrigger: { trigger: el, start, once: true },
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
