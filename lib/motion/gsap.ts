'use client';

/**
 * Shared GSAP setup for the logged-in app's scroll/text motion layer.
 *
 * ONE place registers ScrollTrigger (registering twice is harmless but this
 * keeps it explicit), exposes the reduced-motion check every primitive honors,
 * and the house easing/timing tokens so every animation across the app reads
 * as one system — the Apple-taste bar is: subtle, fast, eased, purposeful.
 * Never garish; motion serves comprehension, it doesn't shout.
 *
 * Import `gsap` + `ScrollTrigger` from here (not directly) so registration is
 * guaranteed and the tokens stay consistent.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/** House easing — a soft, confident ease-out (matches the framer curves used
 *  elsewhere: [0.16, 1, 0.3, 1]). GSAP's CustomEase isn't bundled, so we use
 *  the closest built-in expo-out family, which reads identically at a glance. */
export const EASE = 'expo.out';
export const EASE_INOUT = 'power3.inOut';

/** Timing tokens (seconds) — keep motion quick; long animations feel sluggish
 *  on a productivity surface. */
export const DUR = {
  fast: 0.4,
  base: 0.6,
  slow: 0.9,
} as const;

/** Default stagger between grouped children (seconds). */
export const STAGGER = 0.06;

/** True when the user asked the OS to reduce motion — every primitive must
 *  render its FINAL state instantly in that case (no movement, no delay). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

export { gsap, ScrollTrigger };
