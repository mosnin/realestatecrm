/**
 * TwoTone, the reference's alternating black/gray headline treatment.
 *
 * Pass an array of word-groups; `dim` ones render muted, the rest in
 * near-black. One signature shared across the cloud band, the interactive
 * feature list, and the results-stat card so the family reads as one.
 */

import { cn } from '@/lib/utils';

export interface TwoTonePart {
  t: string;
  dim?: boolean;
}

export function TwoTone({
  parts,
  className,
}: {
  parts: TwoTonePart[];
  className?: string;
}) {
  return (
    <span className={cn('tracking-tight text-zinc-950 dark:text-white', className)}>
      {parts.map((p, i) => (
        <span key={i} className={p.dim ? 'text-neutral-400 dark:text-white/40' : undefined}>
          {p.t}
          {i < parts.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}
