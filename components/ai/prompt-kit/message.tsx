'use client';

import type { HTMLAttributes } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface MessageProps
  extends Omit<HTMLMotionProps<'div'>, 'animate' | 'initial' | 'role' | 'transition'> {
  role: 'user' | 'assistant' | 'system';
  /** Plays a restrained entrance once, when this stable message row mounts. */
  animateIn?: boolean;
}

export function Message({ role, animateIn = false, className, ...props }: MessageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const shouldAnimate = animateIn && !reduceMotion;

  return (
    <motion.div
      data-role={role}
      data-animate-in={shouldAnimate ? 'true' : 'false'}
      initial={
        shouldAnimate
          ? role === 'user'
            ? { opacity: 0, y: 10, scale: 0.985 }
            : { opacity: 0, y: 6 }
          : false
      }
      animate={shouldAnimate ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={cn(
        'flex w-full',
        role === 'user' && 'justify-end',
        role === 'assistant' && 'justify-start',
        role === 'system' && 'justify-center',
        className,
      )}
      {...props}
    />
  );
}

export interface MessageContentProps extends HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'assistant' | 'system';
}

export function MessageContent({ role, className, ...props }: MessageContentProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed',
        // iMessage-style sent bubble: fully-round continuous corners (no
        // clipped notch), inverted fill for real contrast, a soft lift
        // shadow, and a hairline top highlight so the surface reads glossy
        // rather than flat. Inherited text color covers the markdown inside.
        role === 'user' &&
          'max-w-[75%] rounded-[1.375rem] bg-foreground text-background px-4 py-2.5 ' +
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_1.5px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.08)]',
        role === 'assistant' && 'max-w-full text-foreground',
        role === 'system' && 'max-w-2xl rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-center text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
