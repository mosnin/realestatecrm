'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CalendarDays, MapPin, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourSummary {
  tourId: string;
  startsAt: string;
  endsAt?: string | null;
  contactId?: string | null;
  guestName?: string | null;
  propertyAddress?: string | null;
  status?: string | null;
}

interface ToursResultData {
  tours: TourSummary[];
}

const STATUS_TONE: Record<string, string> = {
  scheduled: 'text-amber-600 dark:text-amber-400',
  confirmed: 'text-emerald-600 dark:text-emerald-400',
  completed: 'text-muted-foreground',
  cancelled: 'text-rose-600 dark:text-rose-400',
  no_show: 'text-rose-600 dark:text-rose-400',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Inline rendering of `schedule_tour` (and any future tour-listing) tool
 * results. The realtor sees the scheduled tour as a card they can click
 * straight into, instead of having to open the JSON pane to find an id.
 */
export function ToursResult({ data }: { data: ToursResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { tours } = data;

  if (!tours || tours.length === 0) return null;

  return (
    <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 bg-background overflow-hidden">
      {tours.map((t) => {
        const href = slug ? `/s/${slug}/tours` : '#';
        const statusClass = t.status ? STATUS_TONE[t.status] : undefined;

        return (
          <li key={t.tourId}>
            <Link
              href={href}
              className="group/row flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <CalendarDays size={14} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground truncate">
                    {t.guestName || 'Tour'}
                  </span>
                  {t.status && (
                    <span className={cn('text-[11px]', statusClass)}>{t.status}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} />
                    {formatTime(t.startsAt)}
                  </span>
                  {t.propertyAddress && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin size={10} />
                      <span className="truncate">{t.propertyAddress}</span>
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                size={13}
                className="ml-1 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors flex-shrink-0"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
