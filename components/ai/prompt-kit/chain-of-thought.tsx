'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

export interface ChainOfThoughtProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  streaming?: boolean;
}

/**
 * Collapsed reasoning/body surface for app-approved summaries or traces.
 * Do not pass hidden provider internals here unless the backend intentionally
 * transformed them into user-safe text.
 */
export function ChainOfThought({ content, streaming, className, ...props }: ChainOfThoughtProps) {
  if (!content.trim()) return null;
  return (
    <div
      data-agent-surface-style="inline"
      className={cn(
        'max-h-[400px] overflow-y-auto border-l border-border/40 bg-transparent py-2.5 pl-3 pr-0 text-[12.5px] leading-relaxed text-foreground/80',
        className,
      )}
      {...props}
    >
      <Markdown id="chain-of-thought" streaming={streaming}>
        {content}
      </Markdown>
    </div>
  );
}
