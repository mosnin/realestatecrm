'use client';

/**
 * AnimatedGradientBackground, a customizable animated radial gradient with an
 * optional breathing effect (adapted from the shadcn-style component).
 *
 * Extended for this codebase with:
 *  - `gradientOrigin`: the radial center (e.g. "50% 92%"), so the glow can be
 *    anchored toward an edge instead of always near the top.
 *  - `revealOnScroll`: animate in when the element scrolls into view (whileInView)
 *    instead of on mount.
 * Reduced-motion is respected: no entrance animation and no breathing.
 */

import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import React, { useEffect, useRef } from 'react';

interface AnimatedGradientBackgroundProps {
  /** Initial size of the radial gradient (starting width %). @default 125 */
  startingGap?: number;
  /** Enable the breathing animation. @default false */
  Breathing?: boolean;
  /** Colors for the radial gradient (one per stop). */
  gradientColors?: string[];
  /** Percentage stops (0-100), one per color. */
  gradientStops?: number[];
  /** Breathing speed (lower is slower). @default 0.02 */
  animationSpeed?: number;
  /** Breathing range in percentage points. @default 5 */
  breathingRange?: number;
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  /** Vertical-radius offset; negative values make a wider, flatter ellipse. @default 0 */
  topOffset?: number;
  /** Radial center position. @default "50% 20%" */
  gradientOrigin?: string;
  /** Animate in when scrolled into view rather than on mount. @default false */
  revealOnScroll?: boolean;
}

const AnimatedGradientBackground: React.FC<AnimatedGradientBackgroundProps> = ({
  startingGap = 125,
  Breathing = false,
  gradientColors = ['#0A0A0A', '#2979FF', '#FF80AB', '#FF6D00', '#FFD600', '#00E676', '#3D5AFE'],
  gradientStops = [35, 50, 60, 70, 80, 90, 100],
  animationSpeed = 0.02,
  breathingRange = 5,
  containerStyle = {},
  topOffset = 0,
  gradientOrigin = '50% 20%',
  revealOnScroll = false,
  containerClassName = '',
}) => {
  if (gradientColors.length !== gradientStops.length) {
    throw new Error(
      `gradientColors and gradientStops must have the same length. Received colors: ${gradientColors.length}, stops: ${gradientStops.length}`,
    );
  }

  const containerRef = useRef<HTMLDivElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    let animationFrame: number;
    let width = startingGap;
    let directionWidth = 1;

    const animateGradient = () => {
      if (width >= startingGap + breathingRange) directionWidth = -1;
      if (width <= startingGap - breathingRange) directionWidth = 1;

      if (!Breathing || reduce) directionWidth = 0;
      width += directionWidth * animationSpeed;

      const gradientStopsString = gradientStops
        .map((stop, index) => `${gradientColors[index]} ${stop}%`)
        .join(', ');

      const gradient = `radial-gradient(${width}% ${width + topOffset}% at ${gradientOrigin}, ${gradientStopsString})`;

      if (containerRef.current) {
        containerRef.current.style.background = gradient;
      }

      animationFrame = requestAnimationFrame(animateGradient);
    };

    animationFrame = requestAnimationFrame(animateGradient);
    return () => cancelAnimationFrame(animationFrame);
  }, [startingGap, Breathing, gradientColors, gradientStops, animationSpeed, breathingRange, topOffset, gradientOrigin, reduce]);

  const shown: TargetAndTransition = {
    opacity: 1,
    scale: 1,
    transition: { duration: 1.6, ease: [0.25, 0.1, 0.25, 1] },
  };
  const initial = reduce ? false : { opacity: 0, scale: 1.5 };
  const className = `absolute inset-0 overflow-hidden ${containerClassName}`;
  const inner = <div ref={containerRef} style={containerStyle} className="absolute inset-0 transition-transform" />;

  if (revealOnScroll) {
    return (
      <motion.div key="animated-gradient-background" initial={initial} whileInView={shown} viewport={{ once: true, margin: '-10% 0px' }} className={className}>
        {inner}
      </motion.div>
    );
  }
  return (
    <motion.div key="animated-gradient-background" initial={initial} animate={shown} className={className}>
      {inner}
    </motion.div>
  );
};

export default AnimatedGradientBackground;
