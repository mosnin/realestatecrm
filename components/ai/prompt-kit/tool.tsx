'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { CheckCircle2, Loader2, Lock, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolState = 'running' | 'complete' | 'error' | 'denied' | 'skipped';

const STATE_ICON = {
  running: Loader2,
  complete: CheckCircle2,
  error: XCircle,
  denied: Lock,
  skipped: MinusCircle,
} satisfies Record<ToolState, typeof Loader2>;

export interface ToolProps extends HTMLAttributes<HTMLDivElement> {
  state: ToolState;
}

export function Tool({ state, className, ...props }: ToolProps) {
  return (
    <div
      data-tool-state={state}
      className={cn('relative flex flex-col rounded-lg', className)}
      {...props}
    />
  );
}

export interface ToolStatusProps extends HTMLAttributes<HTMLSpanElement> {
  state: ToolState;
  label: ReactNode;
  icon?: ReactNode;
}

export function ToolStatus({ state, label, icon, className, ...props }: ToolStatusProps) {
  const Icon = STATE_ICON[state];
  return (
    <span
      data-tool-status={state}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-[11px] font-medium',
        state === 'complete' && 'text-emerald-600 dark:text-emerald-400',
        state === 'error' && 'text-muted-foreground',
        state === 'running' && 'text-muted-foreground',
        (state === 'denied' || state === 'skipped') && 'text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon !== undefined ? icon : <Icon size={12} className={state === 'running' ? 'animate-spin' : undefined} />}
      {label}
    </span>
  );
}
