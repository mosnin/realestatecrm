'use client';

/**
 * BriefReveal — the brokerage brief's section entrance envelope.
 *
 * The /broker/brief page is a server component (it fans out a volley of
 * Supabase queries and renders the result inline). To give that static
 * markup the same confident rhythm the realtor brief's bento has — each
 * section fading up on a gentle cascade as the eye travels down — every
 * top-level section is wrapped in this tiny client island. It is purely a
 * motion envelope: it renders its children unchanged, with no card chrome,
 * no layout shift, and no effect on data, links, counts, or actions.
 *
 * Durations + easing come straight from lib/motion (DURATION_BASE, EASE_OUT)
 * — the same curve BriefCell uses — so the broker brief and the realtor
 * brief move with one voice. Everything honors prefers-reduced-motion: when
 * the OS flag is set, sections paint instantly (no fade, no translate), so
 * the surface still reads as calm without movement.
 *
 * `as` lets a caller keep the semantic element (header / section / div).
 */

import { useEffect, useState, type ElementType } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

/**
 * Reduced-motion-aware gate. Returns true only after mount on the client so
 * SSR + first paint never assume motion is off (which would flash the static
 * frame for motion users). Mirrors useBriefMotionEnabled on the realtor side.
 */
function useMotionEnabled(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return !mounted || !reduce;
}

export function BriefReveal({
  children,
  delay = 0,
  as = 'section',
  className,
}: {
  children: React.ReactNode;
  /** Cascade offset (s). Sections increment this so the page settles top-down. */
  delay?: number;
  as?: ElementType;
  className?: string;
}) {
  const motionOn = useMotionEnabled();
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.section;

  return (
    <MotionTag
      className={className}
      initial={motionOn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: motionOn ? delay : 0 }}
    >
      {children}
    </MotionTag>
  );
}
