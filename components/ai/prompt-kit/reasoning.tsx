'use client';

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReasoningProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean;
}

export function Reasoning({ open, className, ...props }: ReasoningProps) {
  return (
    <div
      data-reasoning-open={open ? 'true' : 'false'}
      className={cn('w-full', className)}
      {...props}
    />
  );
}

export interface ReasoningTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  open?: boolean;
  label: ReactNode;
  streaming?: boolean;
}

export function ReasoningTrigger({ open, label, streaming, className, ...props }: ReasoningTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'group flex h-8 w-full cursor-pointer items-center gap-2 text-left text-sm text-neutral-700 dark:text-neutral-300',
        className,
      )}
      {...props}
    >
      <ChevronRight
        className={cn(
          'h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform dark:text-neutral-400',
          open ? 'rotate-90' : 'rotate-0',
        )}
        aria-hidden="true"
      />
      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
      <span className={cn('shrink-0', streaming && 'an-tg-shimmer')}>{label}</span>
    </button>
  );
}
