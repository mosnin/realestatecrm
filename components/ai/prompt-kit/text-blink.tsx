'use client';

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * TextBlink — a live label that gently blinks (opacity fade) while Chippi is
 * thinking, reasoning, or streaming. Replaces the old pulsing-dot indicator:
 * the text itself IS the indicator. Animation + reduced-motion fallback live in
 * `app/globals.css` (`.text-blink`).
 */
export function TextBlink({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('text-blink inline-flex', className)} {...props} />;
}
