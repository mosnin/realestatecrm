'use client';

/**
 * Intake-chat motion vocabulary — the blur-rise entrance shared with the
 * realtor onboarding.
 *
 * The onboarding cinematics (`components/onboarding/onboarding-cinematics.tsx`)
 * establish the brand's "arrival" motion: content blur-rises into place —
 * a y-translate + a `blur()` that resolves to zero on the same expo-out
 * curve. We reuse that EXACT vocabulary here (same easing, same shape) so
 * the applicant-facing intake reads as the same product family, not a
 * lookalike.
 *
 * `useBlurRise(reduce)` returns `initial`/`animate`(/`exit`) props for a
 * `motion` element. When the visitor has asked for reduced motion we collapse
 * to a plain opacity fade — mirroring how the cinematics and globals.css
 * honor `prefers-reduced-motion`. Callers obtain `reduce` from
 * `useReducedMotion()` (motion/react) so it stays reactive.
 */

import { EASE_APPLE } from '@/lib/motion';

/** Same expo-out curve the onboarding cinematics ride in on. */
export const INTAKE_EASE = EASE_APPLE;

/**
 * Blur-rise entrance props for a thread turn / hero element.
 *
 * @param reduce  result of `useReducedMotion()` — render instantly (fade only)
 *                when the visitor prefers reduced motion.
 * @param y       starting y-offset in px (default 14 — the cinematics' settle).
 * @param blur    starting blur radius in px (default 10).
 */
export function blurRise(reduce: boolean | null, y = 14, blur = 10) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    } as const;
  }
  return {
    initial: { opacity: 0, y, filter: `blur(${blur}px)` },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  } as const;
}

/**
 * Full blur-rise WITH a symmetric exit, for `AnimatePresence mode="wait"`
 * step transitions — the onboarding cold-open vocabulary where one focal
 * stage blur-rises in as the previous one blur-falls away. The active
 * intake question is a discrete step, not a line in a scrolling thread, so
 * it enters and leaves as a whole.
 *
 * @param reduce  reduced-motion → opacity-only cross-fade (no blur/translate).
 * @param y       enter offset; exit mirrors to `-y` so the stage lifts away.
 * @param blur    enter/exit blur radius in px.
 */
export function blurRiseStep(reduce: boolean | null, y = 18, blur = 12) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    } as const;
  }
  return {
    initial: { opacity: 0, y, filter: `blur(${blur}px)` },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -y, filter: `blur(${blur}px)` },
  } as const;
}
