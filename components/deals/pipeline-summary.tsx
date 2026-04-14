'use client';

import { useEffect, useMemo, useState } from 'react';
import { Briefcase, DollarSign, TrendingUp, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import type { Deal, DealStage } from '@/lib/types';

interface PipelineSummaryProps {
  slug: string;
  pipelineType: 'rental' | 'buyer';
}

type StageWithDeals = DealStage & { deals: Deal[] };

interface Stat {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClassName: string;
}

export function PipelineSummary({ slug, pipelineType }: PipelineSummaryProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/stages?slug=${encodeURIComponent(slug)}&pipelineType=${pipelineType}`,
        );
        if (!res.ok) {
          if (!cancelled) setStages([]);
          return;
        }
        const data: StageWithDeals[] = await res.json();
        if (!cancelled) setStages(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, pipelineType]);

  const stats: Stat[] = useMemo(() => {
    const activeDeals = stages
      .flatMap((s) => s.deals ?? [])
      .filter((d) => d.status === 'active');

    const totalValue = activeDeals.reduce(
      (sum, d) => sum + (typeof d.value === 'number' ? d.value : 0),
      0,
    );
    const count = activeDeals.length;
    const avgValue = count > 0 ? totalValue / count : 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const closingThisMonth = activeDeals.filter((d) => {
      if (!d.closeDate) return false;
      const cd = new Date(d.closeDate);
      if (isNaN(cd.getTime())) return false;
      return cd.getFullYear() === currentYear && cd.getMonth() === currentMonth;
    }).length;

    return [
      {
        label: 'Pipeline value',
        value: formatCurrency(totalValue),
        icon: DollarSign,
        iconClassName:
          'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      },
      {
        label: 'Active deals',
        value: String(count),
        icon: Briefcase,
        iconClassName:
          'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
      },
      {
        label: 'Avg deal value',
        value: formatCurrency(Math.round(avgValue)),
        icon: TrendingUp,
        iconClassName:
          'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
      },
      {
        label: 'Closing this month',
        value: String(closingThisMonth),
        icon: CalendarClock,
        iconClassName:
          'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
      },
    ];
  }, [stages]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="py-3">
            <CardContent className="px-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    stat.iconClassName,
                  )}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
                    {stat.label}
                  </p>
                  <p
                    className={cn(
                      'text-lg font-semibold tracking-tight truncate',
                      loading && 'opacity-50',
                    )}
                  >
                    {stat.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
