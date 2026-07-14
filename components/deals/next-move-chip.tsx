'use client';

/**
 * NextMoveChip — the agent-computed "what now?" pill on a deal card.
 *
 * Reads the three Deal.nextMove* columns written by lib/deals/next-move.ts.
 * A small rounded-full pill: Sparkles icon + one truncated line, tinted at
 * low saturation by kind so the eye can triage a column ("amber = someone's
 * waiting on you, red = a date is bearing down") without reading every card.
 * A move older than 48h renders dimmed — still useful, visibly yesterday's.
 *
 * Null text → callers render nothing (no chip is an honest state, never a
 * placeholder). This file also owns the shared kind metadata, the staleness
 * rule, and the "Do it" deep-link mapping so the card and the quick panel
 * can't drift apart.
 */

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NextMoveKind =
  | 'follow_up'
  | 'schedule'
  | 'document'
  | 'deadline'
  | 'other';

/** A move older than this is stale — dim it and offer a refresh. */
export const NEXT_MOVE_STALE_MS = 48 * 60 * 60 * 1000;

export function isNextMoveStale(
  computedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!computedAt) return true;
  const d = computedAt instanceof Date ? computedAt : new Date(computedAt);
  if (isNaN(d.getTime())) return true;
  return now.getTime() - d.getTime() > NEXT_MOVE_STALE_MS;
}

/** Low-saturation tints per kind — a wash, never a traffic light. */
export const NEXT_MOVE_KIND_META: Record<
  NextMoveKind,
  { pillClass: string; iconClass: string }
> = {
  follow_up: {
    pillClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    iconClass: 'text-amber-600/80 dark:text-amber-400/80',
  },
  deadline: {
    pillClass: 'bg-red-500/10 text-red-700 dark:text-red-400',
    iconClass: 'text-red-600/80 dark:text-red-400/80',
  },
  schedule: {
    pillClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    iconClass: 'text-blue-600/80 dark:text-blue-400/80',
  },
  document: {
    pillClass: 'bg-foreground/[0.04] text-muted-foreground',
    iconClass: 'text-muted-foreground/80',
  },
  other: {
    pillClass: 'bg-foreground/[0.04] text-muted-foreground',
    iconClass: 'text-muted-foreground/80',
  },
};

export function normalizeNextMoveKind(kind: string | null | undefined): NextMoveKind {
  return kind && kind in NEXT_MOVE_KIND_META ? (kind as NextMoveKind) : 'other';
}

/**
 * Where "Do it" takes the realtor:
 *   follow_up → the contact page with the inline check-in draft surface open
 *               (the same ?quickDraft= idiom ContactActionPills resumes from);
 *               falls back to the deal when the deal has no linked contact.
 *   schedule  → the calendar.
 *   document  → the deal's Documents tab.
 *   deadline / other → the deal itself.
 */
export function nextMoveHref(args: {
  kind: NextMoveKind;
  slug: string;
  dealId: string;
  contactId?: string | null;
}): string {
  const dealHref = `/s/${args.slug}/deals/${args.dealId}`;
  switch (args.kind) {
    case 'follow_up':
      return args.contactId
        ? `/s/${args.slug}/contacts/${args.contactId}?quickDraft=check-in`
        : dealHref;
    case 'schedule':
      return `/s/${args.slug}/calendar`;
    case 'document':
      return `${dealHref}?tab=documents`;
    default:
      return dealHref;
  }
}

interface NextMoveChipProps {
  text: string;
  kind: string | null | undefined;
  computedAt: Date | string | null | undefined;
  className?: string;
}

export function NextMoveChip({ text, kind, computedAt, className }: NextMoveChipProps) {
  const k = normalizeNextMoveKind(kind);
  const meta = NEXT_MOVE_KIND_META[k];
  const stale = isNextMoveStale(computedAt);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 h-6 text-[11px] font-medium',
        meta.pillClass,
        stale && 'opacity-50',
        className,
      )}
      title={stale ? `${text} (needs a refresh)` : text}
    >
      <Sparkles size={11} className={cn('flex-shrink-0', meta.iconClass)} />
      <span className="truncate">{text}</span>
    </span>
  );
}
