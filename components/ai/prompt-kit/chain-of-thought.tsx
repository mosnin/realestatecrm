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
      className={cn(
        'max-h-[400px] overflow-y-auto rounded-md border border-border/40 bg-muted/30 px-3 py-2.5 text-[12.5px] leading-relaxed text-foreground/80',
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
