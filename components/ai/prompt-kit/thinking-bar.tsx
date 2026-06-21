'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { TextShimmer } from './text-shimmer';

export interface ThinkingBarProps extends HTMLAttributes<HTMLDivElement> {
  label?: string | null;
}

export function ThinkingBar({ label = 'Thinking…', className, children, ...props }: ThinkingBarProps) {
  return (
    <div className={cn('flex min-h-7 items-center gap-2', className)} {...props}>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/35" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary/60" />
      </span>
      <TextShimmer className="text-[13px] font-medium leading-relaxed">
        {children ?? label}
      </TextShimmer>
    </div>
  );
}
