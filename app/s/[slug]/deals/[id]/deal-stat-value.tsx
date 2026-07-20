'use client';

/**
 * Tiny client island for the deal detail server page (`page.tsx`).
 *
 * `AnimatedNumber`'s `format` prop is a function, and functions can't cross
 * the server→client prop boundary in the App Router — so the formatter has
 * to live inside a client module rather than being passed in from the
 * server component. This wraps `formatCurrency`/`formatCompact` locally and
 * only takes the serializable `value`/`compact` props across the boundary.
 */

import { AnimatedNumber } from '@/components/motion';
import { formatCurrency, formatCompact } from '@/lib/formatting';

export function AnimatedCurrencyStat({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  return <AnimatedNumber value={value} format={compact ? formatCompact : formatCurrency} />;
}
