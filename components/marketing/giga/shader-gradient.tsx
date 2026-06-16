'use client';

/**
 * ShaderGradient — a smooth, slowly twirling mesh gradient (the soft pink/orange
 * band above the footer). Built from large blurred color blobs inside a slowly
 * rotating field, so it reads as an organic, ever-shifting gradient without a
 * WebGL dependency. Adapts to light/dark and respects reduced motion.
 */

import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { cn } from '@/lib/utils';

export function ShaderGradient({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  const blob = (cls: string, anim: TargetAndTransition, duration: number, delay = 0) => (
    <motion.div
      aria-hidden
      className={cn('absolute rounded-full blur-3xl', cls)}
      animate={reduce ? undefined : anim}
      transition={reduce ? undefined : { duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut', delay }}
    />
  );

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {/* soft base wash */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#ffe7d3] via-[#ffd9ec] to-[#eedcff] dark:from-[#1c1320] dark:via-[#2a1622] dark:to-[#1a1626]" />
      {/* slowly rotating field of blurred color blobs */}
      <motion.div
        className="absolute inset-[-30%]"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={reduce ? undefined : { duration: 70, repeat: Infinity, ease: 'linear' }}
      >
        {blob('left-[5%] top-[10%] h-[55vh] w-[55vh] bg-[#ff7a45]/28 dark:bg-[#ff7a45]/22', { x: [0, 120, -40, 0], y: [0, 60, 30, 0], scale: [1, 1.15, 0.95, 1] }, 24)}
        {blob('right-[8%] top-[20%] h-[50vh] w-[50vh] bg-[#ff5fa2]/28 dark:bg-[#ff5fa2]/22', { x: [0, -90, 40, 0], y: [0, 50, -30, 0], scale: [1, 0.9, 1.2, 1] }, 30, 1)}
        {blob('left-[35%] bottom-[5%] h-[48vh] w-[48vh] bg-[#c77dff]/26 dark:bg-[#c77dff]/20', { x: [0, 70, -60, 0], y: [0, -40, 40, 0], scale: [1, 1.2, 1, 1] }, 27, 0.5)}
        {blob('right-[30%] bottom-[10%] h-[40vh] w-[40vh] bg-[#ffb37a]/26 dark:bg-[#ffb37a]/18', { x: [0, -60, 50, 0], y: [0, 40, -20, 0], scale: [1, 1.1, 0.9, 1] }, 33, 1.5)}
      </motion.div>
    </div>
  );
}
