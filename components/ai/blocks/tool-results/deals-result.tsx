'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Calendar, MapPin, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DealSummary {
  id: string;
  title: string;
  address?: string | null;
  value?: number | null;
  status?: string;
  priority?: string;
  stageId?: string;
  closeDate?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
}

interface DealsResultData {
  deals: DealSummary[];
}

function formatValue(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}

const PRIORITY_TONE: Record<string, string> = {
  high: 'text-rose-600 dark:text-rose-400',
  urgent: 'text-rose-600 dark:text-rose-400',
};

/**
 * Inline rendering of `search_deals` results. Each deal as a clickable row
 * with title, address, value, and any next-action hint. Routes back to the
 * pipeline list (per-deal detail view doesn't have its own route yet).
 */
export function DealsResult({ data }: { data: DealsResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { deals } = data;

  if (!deals || deals.length === 0) return null;

  return (
    <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 bg-background overflow-hidden">
      {deals.map((d) => {
        const value = formatValue(d.value);
        const priorityTone = d.priority ? PRIORITY_TONE[d.priority] : undefined;
        const overdue =
          d.nextActionDueAt && new Date(d.nextActionDueAt) < new Date() ? d.nextActionDueAt : null;
        const href = slug ? `/s/${slug}/deals` : '#';

        return (
          <li key={d.id}>
            <Link
              href={href}
              className="group/row flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground truncate">{d.title}</span>
                  {value && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">{value}</span>
                  )}
                  {d.priority && priorityTone && (
                    <span className={cn('text-[11px]', priorityTone)}>{d.priority}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                  {d.address && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin size={10} />
                      {d.address}
                    </span>
                  )}
                  {d.closeDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={10} />
                      closes {new Date(d.closeDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {overdue && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={10} />
                      action overdue
                    </span>
                  )}
                </div>
                {d.nextAction && !overdue && (
                  <p className="text-[11px] text-muted-foreground italic line-clamp-1 mt-0.5">
                    next: {d.nextAction}
                  </p>
                )}
              </div>
              <ChevronRight
                size={13}
                className="flex-shrink-0 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
