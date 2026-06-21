'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface StepsProps extends HTMLAttributes<HTMLDivElement> {
  state?: 'pending' | 'completed' | 'interrupted';
  count?: number;
}

export function Steps({ state = 'completed', count, className, ...props }: StepsProps) {
  return (
    <div
      data-steps-state={state}
      data-steps-count={count}
      className={cn('space-y-2', className)}
      {...props}
    />
  );
}
