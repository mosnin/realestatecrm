'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function TextShimmer({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex animate-pulse bg-[linear-gradient(110deg,hsl(var(--muted-foreground))_0%,hsl(var(--foreground))_45%,hsl(var(--muted-foreground))_90%)] bg-[length:200%_100%] bg-clip-text text-transparent',
        className,
      )}
      {...props}
    />
  );
}
