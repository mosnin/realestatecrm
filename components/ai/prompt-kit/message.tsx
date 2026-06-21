'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  role: 'user' | 'assistant' | 'system';
}

export function Message({ role, className, ...props }: MessageProps) {
  return (
    <div
      data-role={role}
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
        role === 'user' && 'max-w-[75%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-foreground',
        role === 'assistant' && 'max-w-full text-foreground',
        role === 'system' && 'max-w-2xl rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-center text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
