'use client';

/**
 * AnimatedGradientText — a flowing animated gradient clipped to text.
 * (Magic UI style.) Pair with the `gradient-flow` keyframes in globals.css.
 */

import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef, CSSProperties } from 'react';

interface AnimatedGradientTextProps extends ComponentPropsWithoutRef<'span'> {
  speed?: number;
  colorFrom?: string;
  colorTo?: string;
}

export function AnimatedGradientText({
  children,
  className,
  speed = 1,
  colorFrom = '#ffaa40',
  colorTo = '#9c40ff',
  style,
  ...props
}: AnimatedGradientTextProps) {
  return (
    <span
      style={
        {
          '--bg-size': `${speed * 300}%`,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          ...style,
        } as CSSProperties
      }
      className={cn(
        'inline animate-[gradient-flow_8s_linear_infinite] bg-gradient-to-r from-[var(--color-from)] via-[var(--color-to)] to-[var(--color-from)] bg-[length:var(--bg-size)_100%] bg-clip-text text-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
