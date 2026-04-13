'use client';

import { CalendarDays, TrendingUp, UserX, Clock } from 'lucide-react';

interface TourStats {
  toursThisWeek: number;
  conversionRate: number;
  noShowRate: number;
  avgConfirmTime: string;
}

interface TourStatsStripProps {
  tours: Array<{
    startsAt: string;
    status: string;
    sourceDealId: string | null;
    createdAt?: string;
  }>;
}

function computeStats(tours: TourStatsStripProps['tours']): TourStats {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const toursThisWeek = tours.filter((t) => {
    const d = new Date(t.startsAt);
    return d >= weekStart && d < weekEnd && t.status !== 'cancelled';
  }).length;

  const completed = tours.filter((t) => t.status === 'completed');
  const withDeals = completed.filter((t) => t.sourceDealId);
  const conversionRate = completed.length > 0 ? Math.round((withDeals.length / completed.length) * 100) : 0;

  const past = tours.filter((t) => new Date(t.startsAt) < now && t.status !== 'cancelled');
  const noShows = tours.filter((t) => t.status === 'no_show');
  const noShowRate = past.length > 0 ? Math.round((noShows.length / past.length) * 100) : 0;

  // Average time from creation to confirmation (rough proxy)
  const confirmed = tours.filter((t) => ['confirmed', 'completed'].includes(t.status));
  let avgConfirmTime = '—';
  if (confirmed.length > 0) {
    // Use time until tour as proxy
    const times = confirmed
      .map((t) => {
        const tourDate = new Date(t.startsAt);
        const created = t.createdAt ? new Date(t.createdAt) : null;
        if (!created) return null;
        return tourDate.getTime() - created.getTime();
      })
      .filter((t): t is number => t != null && t > 0);
    if (times.length > 0) {
      const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
      const avgDays = Math.round(avgMs / (1000 * 60 * 60 * 24));
      avgConfirmTime = avgDays <= 1 ? 'Same day' : `${avgDays}d avg`;
    }
  }

  return { toursThisWeek, conversionRate, noShowRate, avgConfirmTime };
}

export function TourStatsStrip({ tours }: TourStatsStripProps) {
  const stats = computeStats(tours);

  const items = [
    { label: 'This Week', value: String(stats.toursThisWeek), icon: CalendarDays, color: 'text-orange-500' },
    { label: 'Conversion', value: `${stats.conversionRate}%`, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'No-Show', value: `${stats.noShowRate}%`, icon: UserX, color: stats.noShowRate > 20 ? 'text-red-500' : 'text-amber-500' },
    { label: 'Lead Time', value: stats.avgConfirmTime, icon: Clock, color: 'text-muted-foreground' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Icon size={15} className={item.color} />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums leading-none">{item.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
