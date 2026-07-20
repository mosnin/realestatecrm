/**
 * The logged-in app's motion system. Import scroll/text/number primitives
 * from here so every surface animates as one consistent, Apple-restrained
 * language. All primitives honor prefers-reduced-motion.
 *
 * GSAP scroll/text layer (new):
 *   <Reveal>          — scroll-in fade/rise/blur/scale for a single block
 *   <StaggerReveal>   — cascade direct children in as the group scrolls in
 *   <SplitReveal>     — Apple-style word/char text reveal
 *   <Parallax>        — subtle scroll-linked drift for DECORATIVE layers only
 *
 * framer-motion layer (existing):
 *   <AnimatedNumber>  — count-up on view
 *   <AnimatedStatCell>, <StaggerList>/<StaggerItem>, <PageTransition>
 */

export { Reveal, refreshScrollTriggers } from './reveal';
export type { RevealProps } from './reveal';
export { StaggerReveal } from './stagger-reveal';
export type { StaggerRevealProps } from './stagger-reveal';
export { SplitReveal } from './split-reveal';
export type { SplitRevealProps } from './split-reveal';
export { Parallax } from './parallax';
export type { ParallaxProps } from './parallax';

export { AnimatedNumber } from './animated-number';
export { AnimatedStatCell } from './animated-stat-cell';
export { StaggerList, StaggerItem } from './stagger-list';
export { PageTransition } from './page-transition';

export {
  EASE,
  EASE_INOUT,
  DUR,
  STAGGER,
  prefersReducedMotion,
} from '@/lib/motion/gsap';
