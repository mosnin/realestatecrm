'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { TextBlink } from './text-blink';

export interface ThinkingBarProps extends HTMLAttributes<HTMLDivElement> {
  label?: string | null;
}

export function ThinkingBar({ label = 'Thinking…', className, children, ...props }: ThinkingBarProps) {
  return (
    <div className={cn('flex min-h-7 items-center', className)} {...props}>
      {/* The blinking text IS the indicator — no pulsing dot. */}
      <TextBlink className="text-[13px] font-medium leading-relaxed text-muted-foreground">
        {children ?? label}
      </TextBlink>
    </div>
  );
}
