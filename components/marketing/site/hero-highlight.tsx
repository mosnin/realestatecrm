'use client';

/**
 * HeroHighlight, a dot-grid band that lights up under the cursor (in the
 * Chippi orange), with a <Highlight> that sweeps a warm marker behind a phrase.
 * We use it for the "second brain / drafts in your voice" moments. The accent
 * is brand orange, not the source component's indigo, orange is the Chippi
 * signature, and these lines are about Chippi. Reduced motion: marker arrives
 * already drawn.
 */

import { cn } from '@/lib/utils';
import { useMotionValue, motion, useMotionTemplate, useReducedMotion } from 'framer-motion';
import React from 'react';

export function HeroHighlight({
  children,
  className,
  containerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
    if (!currentTarget) return;
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const dotPattern = (color: string) => ({
    backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
    backgroundSize: '16px 16px',
  });

  return (
    <div
      className={cn(
        'group relative flex w-full items-center justify-center bg-background',
        containerClassName,
      )}
      onMouseMove={handleMouseMove}
    >
      {/* base dot grid, neutral in both themes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:hidden"
        style={dotPattern('rgb(212 212 212)')}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden opacity-60 dark:block"
        style={dotPattern('rgb(38 38 38)')}
      />
      {/* the warm reveal that follows the cursor, Chippi orange */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          ...dotPattern('rgb(255 150 79)'),
          WebkitMaskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
          maskImage: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
        }}
      />
      <div className={cn('relative z-20', className)}>{children}</div>
    </div>
  );
}

export function Highlight({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      initial={{ backgroundSize: reduce ? '100% 100%' : '0% 100%' }}
      whileInView={{ backgroundSize: '100% 100%' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: reduce ? 0 : 1.4, ease: 'linear', delay: reduce ? 0 : 0.3 }}
      style={{
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'left center',
        display: 'inline',
      }}
      className={cn(
        'relative inline-block rounded-md px-1 pb-1',
        'bg-gradient-to-r from-brand/30 to-brand-subtle',
        className,
      )}
    >
      {children}
    </motion.span>
  );
}
