'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SystemMessageProps extends HTMLAttributes<HTMLDivElement> {
  heading?: ReactNode;
  description?: ReactNode;
  tone?: 'info' | 'warning' | 'error';
  action?: ReactNode;
}

export function SystemMessage({ heading, description, tone = 'info', action, className, children, ...props }: SystemMessageProps) {
  const Icon = tone === 'info' ? Info : AlertCircle;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border p-4 text-center',
        tone === 'info' && 'border-border bg-muted/35 text-muted-foreground',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
        tone === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
        className,
      )}
      {...props}
    >
      <div className="mb-2 flex justify-center">
        <Icon size={20} aria-hidden="true" />
      </div>
      {heading && <p className="mb-1 text-sm font-medium">{heading}</p>}
      {description && <p className="mb-3 text-xs opacity-85">{description}</p>}
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
